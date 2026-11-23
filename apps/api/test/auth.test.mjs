// 인증 테스트 (HTTP 수준, 실제 PostgreSQL): 로그인, 입력 검증
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken } from '../dist/auth/token.js';
import { TOKEN_SECRET, startServer } from './helpers.mjs';

let server;
before(async () => {
  server = await startServer(4196);
});
after(async () => {
  await server?.stop();
});

function login(body) {
  return fetch(`${server.base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('로그인 성공 → 200, 토큰의 uid가 그 사용자이고 응답은 캐시 금지', async () => {
  const res = await login({ username: 'student1', password: 'student1-pass' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['expiresIn', 'token']);
  assert.equal(body.expiresIn, 3600);
  assert.equal(verifyToken(body.token, TOKEN_SECRET)?.uid, 'u1');
});

test('틀린 비밀번호와 없는 아이디 → 같은 401 응답', async () => {
  const wrong = await login({ username: 'student1', password: 'student2-pass' });
  const unknown = await login({ username: 'nobody', password: 'student1-pass' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), { error: 'unauthorized' });
  assert.deepEqual(await unknown.json(), { error: 'unauthorized' });
});

test('필드가 빠지거나 비어 있으면 400이고 어느 필드인지 알려 줌', async () => {
  for (const body of [{}, { username: 'student1' }, { password: 'student1-pass' }, { username: '', password: 'student1-pass' }]) {
    const res = await login(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const json = await res.json();
    assert.equal(json.error, 'bad_request');
    assert.ok(Array.isArray(json.details) && json.details.length > 0);
  }
});

test('선언하지 않은 필드(role)를 함께 보내면 400', async () => {
  const res = await login({ username: 'student1', password: 'student1-pass', role: 'admin' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).details.join(' '), /role/);
});

test('문자열이 아닌 값(객체, 배열, 숫자)은 400', async () => {
  for (const username of [{ $ne: null }, ['student1'], 1]) {
    const res = await login({ username, password: 'student1-pass' });
    assert.equal(res.status, 400, JSON.stringify(username));
  }
});

test('상한보다 긴 값은 400이고, 오류 응답에 입력값이 되돌아오지 않음', async () => {
  const secret = 'S3cret-value-that-must-not-echo';
  const res = await login({ username: 'student1', password: secret.repeat(10) });
  assert.equal(res.status, 400);
  assert.ok(!(await res.text()).includes(secret));

  const denied = await login({ username: 'student1', password: secret });
  assert.equal(denied.status, 401);
  assert.ok(!(await denied.text()).includes(secret));
});

test('서버 출력에 비밀번호와 토큰 값이 없음', async () => {
  const res = await login({ username: 'admin1', password: 'admin1-pass' });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  assert.equal(typeof token, 'string');
  await login({ username: 'admin1', password: 'wrong-pass-for-log-check' });
  const output = server.output();
  assert.ok(!output.includes('admin1-pass'));
  assert.ok(!output.includes('wrong-pass-for-log-check'));
  assert.ok(!output.includes(token));
});
