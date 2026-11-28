// 인증 테스트: 로그인, 입력값 검증, 전역 인증 Guard
// API를 띄우고 HTTP 요청을 보낸다(앱 계층, L7). DB는 실제 PostgreSQL을 쓴다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { issueToken, verifyToken } from '../dist/auth/token.js';
import { DATABASE_URL, TOKEN_SECRET, startServer } from './helpers.mjs';

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

test('잘못 입력한 비밀번호와 존재하지 않는 아이디 → 같은 401 응답', async () => {
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

test('상한보다 긴 값은 400이고, 오류 응답에 입력값이 들어 있지 않음', async () => {
  const secret = 'S3cret-value-that-must-not-echo';
  const res = await login({ username: 'student1', password: secret.repeat(10) });
  assert.equal(res.status, 400);
  assert.ok(!(await res.text()).includes(secret));

  const denied = await login({ username: 'student1', password: secret });
  assert.equal(denied.status, 401);
  assert.ok(!(await denied.text()).includes(secret));
});

test('서버 로그에 비밀번호와 토큰 값이 없음', async () => {
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

// 결함 3(docs/v2-defects.md)을 잡는다. 이 테스트는 로그인 응답으로 받은 토큰을 Authorization 헤더에 넣어 GET /auth/me를 요청한 뒤,
// 받은 토큰이 서버 로그에 없는지 확인한다. 바로 위의 '서버 로그에 비밀번호와 토큰 값이 없음' 테스트는 토큰을 Authorization 헤더에 넣어
// 요청하지 않아서, 인증 Guard가 헤더의 토큰을 서버 로그에 기록하는지 확인하지 못한다.
test('서버 로그에 요청으로 받은 토큰 값이 없음 (유효한 토큰, 유효하지 않은 토큰)', async () => {
  const valid = await tokenFor('student1');
  assert.equal((await me(`Bearer ${valid}`)).status, 200);
  // 유효하지 않은 토큰도 서버 로그에 남으면 안 된다. 다른 테스트의 토큰과 겹치지 않는 값을 쓴다.
  const wrong = 'bG9nLWNoZWNrLXdyb25nLXRva2Vu.bm90LWEtcmVhbC1zaWduYXR1cmU';
  assert.equal((await me(`Bearer ${wrong}`)).status, 401);

  const output = server.output();
  // assert가 실패할 때 토큰 값을 테스트 로그에 기록하지 않도록 문구를 직접 준다.
  assert.ok(!output.includes(valid), '유효한 토큰이 서버 로그에 있습니다');
  assert.ok(!output.includes(wrong), '유효하지 않은 토큰이 서버 로그에 있습니다');
});

// ---- 전역 인증 Guard ----

async function tokenFor(username) {
  const res = await login({ username, password: `${username}-pass` });
  assert.equal(res.status, 200);
  return (await res.json()).token;
}

function me(authorization) {
  return fetch(`${server.base}/auth/me`, { headers: authorization === undefined ? {} : { authorization } });
}

async function assertUnauthorized(res, label) {
  assert.equal(res.status, 401, label);
  assert.deepEqual(await res.json(), { error: 'unauthorized' }, label);
}

test('유효한 토큰 → API는 200과 요청한 사람의 id, 역할로 응답함', async () => {
  const student = await me(`Bearer ${await tokenFor('student1')}`);
  assert.equal(student.status, 200);
  assert.deepEqual(await student.json(), { id: 'u1', role: 'student' });

  const admin = await me(`Bearer ${await tokenFor('admin1')}`);
  assert.deepEqual(await admin.json(), { id: 'a1', role: 'admin' });
});

test('토큰이 없거나 Authorization 헤더의 형식이 잘못되면 401', async () => {
  const token = await tokenFor('student1');
  await assertUnauthorized(await me(undefined), '헤더 없음');
  for (const header of ['Bearer', 'Bearer ', token, `Basic ${token}`, `Bearer ${token} extra`, `Bearer ${token}.extra`]) {
    await assertUnauthorized(await me(header), header.slice(0, 12));
  }
});

test('페이로드의 uid를 관리자(a1)로 바꾼 토큰 → 401', async () => {
  const [body, signature] = (await tokenFor('student1')).split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...payload, uid: 'a1' })).toString('base64url');
  await assertUnauthorized(await me(`Bearer ${forged}.${signature}`), '변조');
});

test('만료된 토큰 → 401', async () => {
  // 서버와 같은 키로, 발급 시각을 1시간 1초 전으로 해서 만든다.
  const expired = issueToken('u1', TOKEN_SECRET, Date.now() - 3601 * 1000);
  await assertUnauthorized(await me(`Bearer ${expired}`), '만료');
  // 같은 키로 지금 발급한 토큰에는 API가 200으로 응답한다. 앞의 401이 만료 때문이라는 것을 확인한다.
  assert.equal((await me(`Bearer ${issueToken('u1', TOKEN_SECRET)}`)).status, 200);
});

test('다른 키로 서명한 토큰, 존재하지 않는 사용자의 토큰 → 401', async () => {
  await assertUnauthorized(await me(`Bearer ${issueToken('a1', 'attacker-chosen-secret-00000000000000')}`), '다른 키');
  await assertUnauthorized(await me(`Bearer ${issueToken('no-such-user', TOKEN_SECRET)}`), '존재하지 않는 사용자');
});

test('역할은 토큰이 아니라 DB에서 읽음: 역할을 바꾸면 같은 토큰의 다음 요청에 반영됨', async () => {
  const token = await tokenFor('instructor2');
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    assert.deepEqual(await (await me(`Bearer ${token}`)).json(), { id: 'i2', role: 'instructor' });
    await db.query(`update users set role = 'student' where id = 'i2'`);
    assert.deepEqual(await (await me(`Bearer ${token}`)).json(), { id: 'i2', role: 'student' });
  } finally {
    await db.query(`update users set role = 'instructor' where id = 'i2'`);
    await db.end();
  }
});

test('@Public이 붙은 경로(헬스 체크, 로그인): API는 토큰 없는 요청에 200으로 응답함', async () => {
  assert.equal((await fetch(`${server.base}/health/live`)).status, 200);
  assert.equal((await fetch(`${server.base}/health/ready`)).status, 200);
  assert.equal((await login({ username: 'student1', password: 'student1-pass' })).status, 200);
});
