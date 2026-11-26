// 강의 목록과 수강생 명단 테스트 (HTTP 수준, 실제 PostgreSQL)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

let server;
const auth = {};
before(async () => {
  server = await startServer(4193);
  for (const name of ['instructor1', 'instructor2', 'admin1']) {
    auth[name] = await bearerFor(server.base, name);
  }
});
after(async () => {
  await server?.stop();
});

const get = (path, authorization) => fetch(`${server.base}${path}`, { headers: authorization ? { authorization } : {} });
const ids = async (res) => (await res.json()).map((e) => e.id);

test('강의 목록: 토큰 없이 200, id와 제목만 돌려줌', async () => {
  const res = await get('/courses');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [
    { id: 'c1', title: '웹 보안 입문' },
    { id: 'c2', title: '시큐어 코딩 실습' },
  ]);
});

test('수강생 명단: 담당 강사는 자기 강의의 신청 전부', async () => {
  const res = await get('/courses/c1/enrollments', auth.instructor1);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ids(res), ['e1', 'e2']);
  assert.deepEqual(await ids(await get('/courses/c2/enrollments', auth.instructor2)), ['e3']);
});

test('수강생 명단: 관리자는 모든 강의', async () => {
  assert.deepEqual(await ids(await get('/courses/c1/enrollments', auth.admin1)), ['e1', 'e2']);
  assert.deepEqual(await ids(await get('/courses/c2/enrollments', auth.admin1)), ['e3']);
});
