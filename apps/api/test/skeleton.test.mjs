// API 골격 테스트 (HTTP 수준, 실제 PostgreSQL): 헬스 체크, 오류 응답 형식, 시작 조건, 시드
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { DATABASE_URL, TOKEN_SECRET, runUntilExit, startServer } from './helpers.mjs';

let server;
before(async () => {
  server = await startServer(4199);
});
after(async () => {
  await server?.stop();
});

test('GET /health/live → 200', async () => {
  const res = await fetch(`${server.base}/health/live`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /health/ready → 200 (DB에 쿼리가 닿음)', async () => {
  const res = await fetch(`${server.base}/health/ready`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('DB에 닿지 않으면 /health/ready 503, /health/live 200', async () => {
  // 아무것도 듣지 않는 포트를 DB 주소로 준다.
  const down = await startServer(4198, { DATABASE_URL: 'postgresql://enroll:dummy-local-only@127.0.0.1:1/enroll' });
  try {
    const ready = await fetch(`${down.base}/health/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { error: 'service_unavailable' });
    assert.equal((await fetch(`${down.base}/health/live`)).status, 200);
  } finally {
    await down.stop();
  }
});

test('등록되지 않은 경로 → 404, response body는 { error } 하나뿐', async () => {
  const res = await fetch(`${server.base}/no-such-path`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('깨진 JSON request body → 400, 스택·경로·예외 문구가 응답에 없음', async () => {
  const res = await fetch(`${server.base}/health/live`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"broken": ',
  });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { error: 'bad_request' });
  assert.doesNotMatch(text, /at |node_modules|\.js|SyntaxError|Unexpected/);
});

test('응답 헤더에 프레임워크 이름이 없음', async () => {
  const res = await fetch(`${server.base}/health/live`);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('DATABASE_URL이 없으면 시작을 거부함', async () => {
  const { code } = await runUntilExit({ PORT: '4197', TOKEN_SECRET });
  assert.notEqual(code, 0);
  assert.notEqual(code, null);
});

test('TOKEN_SECRET이 없거나 32자보다 짧으면 시작을 거부함', async () => {
  for (const env of [{}, { TOKEN_SECRET: 'too-short' }]) {
    const { code } = await runUntilExit({ PORT: '4197', DATABASE_URL, ...env });
    assert.notEqual(code, 0);
    assert.notEqual(code, null);
  }
});

test('시드: 사용자 9, 강의 4, 신청 3이고 비밀번호는 해시로만 저장됨', async () => {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const count = async (table) => Number((await db.query(`select count(*) from ${table}`)).rows[0].count);
    assert.equal(await count('users'), 9);
    assert.equal(await count('courses'), 4);
    assert.equal(await count('enrollments'), 3);

    const { rows } = await db.query('select username, "passwordHash" from users');
    for (const { username, passwordHash } of rows) {
      assert.match(passwordHash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/, username);
      assert.ok(!passwordHash.includes(`${username}-pass`), username);
    }
    // 솔트가 사용자마다 달라서 해시가 서로 겹치지 않는다.
    assert.equal(new Set(rows.map((r) => r.passwordHash)).size, rows.length);
  } finally {
    await db.end();
  }
});
