// 신청 생성·취소 테스트 (HTTP 수준, 실제 PostgreSQL)
// 이 파일은 DB의 내용을 바꾼다. 시드의 신청(e1~e3)은 지우지 않고, 만든 신청은 끝날 때 지운다.
// 테스트 파일은 하나씩 차례로 돈다(package.json의 --test-concurrency=1). 다른 파일이 목록 전체를 비교하기 때문이다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { DATABASE_URL, bearerFor, startServer } from './helpers.mjs';

const SEEDED = ['e1', 'e2', 'e3'];

let server;
const auth = {};
const db = new pg.Client({ connectionString: DATABASE_URL });

// 시드에 없던 신청을 모두 지운다. 테스트가 중간에 실패해도 다음 파일이 시드 상태에서 시작하게 한다.
const cleanup = () => db.query('delete from enrollments where id <> all($1)', [SEEDED]);

before(async () => {
  await db.connect();
  await cleanup();
  server = await startServer(4196);
  for (const name of ['student1', 'student2', 'instructor1', 'admin1']) {
    auth[name] = await bearerFor(server.base, name);
  }
});
after(async () => {
  await cleanup();
  await db.end();
  await server?.stop();
});

const call = (method, path, authorization, body) =>
  fetch(`${server.base}${path}`, {
    method,
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const exists = async (id) => (await db.query('select 1 from enrollments where id = $1', [id])).rowCount === 1;

test('신청 취소: 토큰 없이 401', async () => {
  assert.equal((await call('DELETE', '/enrollments/e1')).status, 401);
  assert.ok(await exists('e1'));
});

test('신청 취소: 다른 학생의 신청은 403이고 지워지지 않음', async () => {
  const res = await call('DELETE', '/enrollments/e1', auth.student2);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'forbidden' });
  assert.ok(await exists('e1'));
});

test('신청 취소: 담당 강사는 조회만 할 수 있고 취소는 403', async () => {
  assert.equal((await call('DELETE', '/enrollments/e1', auth.instructor1)).status, 403);
  assert.ok(await exists('e1'));
});

test('신청 취소: 없는 id는 404', async () => {
  const res = await call('DELETE', '/enrollments/no-such-id', auth.admin1);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});
