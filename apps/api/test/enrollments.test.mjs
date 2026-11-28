// 신청 조회 테스트 (HTTP 수준, 실제 PostgreSQL)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

let server;
const auth = {};
before(async () => {
  server = await startServer(4195);
  for (const name of ['student1', 'student2', 'instructor1', 'instructor2', 'admin1']) {
    auth[name] = await bearerFor(server.base, name);
  }
});
after(async () => {
  await server?.stop();
});

const get = (path, authorization) => fetch(`${server.base}${path}`, { headers: authorization ? { authorization } : {} });
const ids = async (res) => (await res.json()).map((e) => e.id);

test('내 신청 목록: 학생은 본인의 신청만', async () => {
  const res = await get('/enrollments', auth.student1);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), [{ id: 'e1', userId: 'u1', courseId: 'c1', phone: '010-0000-0001' }]);
  assert.deepEqual(await ids(await get('/enrollments', auth.student2)), ['e2', 'e3']);
});

test('내 신청 목록: 강사는 담당 강의의 신청만, 관리자는 전체', async () => {
  assert.deepEqual(await ids(await get('/enrollments', auth.instructor1)), ['e1', 'e2']);
  assert.deepEqual(await ids(await get('/enrollments', auth.instructor2)), ['e3']);
  assert.deepEqual(await ids(await get('/enrollments', auth.admin1)), ['e1', 'e2', 'e3']);
});

test('신청 한 건: 학생은 본인의 신청 200, 다른 사용자의 신청 403', async () => {
  const mine = await get('/enrollments/e1', auth.student1);
  assert.equal(mine.status, 200);
  assert.equal((await mine.json()).userId, 'u1');

  const others = await get('/enrollments/e2', auth.student1);
  assert.equal(others.status, 403);
  assert.deepEqual(await others.json(), { error: 'forbidden' });
});

test('신청 한 건: 강사는 담당 강의의 신청 200, 다른 강사 강의의 신청 403', async () => {
  assert.equal((await get('/enrollments/e1', auth.instructor1)).status, 200);
  assert.equal((await get('/enrollments/e3', auth.instructor1)).status, 403);
});

test('신청 한 건: 관리자는 모두 200, 존재하지 않는 id는 404', async () => {
  assert.equal((await get('/enrollments/e3', auth.admin1)).status, 200);
  const missing = await get('/enrollments/no-such-id', auth.admin1);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not_found' });
});

test('전체 신청 목록: 관리자 200, 3건', async () => {
  const res = await get('/admin/enrollments', auth.admin1);
  assert.equal(res.status, 200);
  assert.deepEqual(await ids(res), ['e1', 'e2', 'e3']);
});
