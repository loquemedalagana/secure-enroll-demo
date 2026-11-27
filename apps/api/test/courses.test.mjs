// 강의 목록과 수강생 명단 테스트 (HTTP 수준, 실제 PostgreSQL)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

let server;
const auth = {};
before(async () => {
  server = await startServer(4193);
  for (const name of ['student1', 'instructor1', 'instructor2', 'admin1']) {
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

test('강의 검색: 제목에 검색어가 들어 있는 강의만, 대소문자 구분 없이', async () => {
  const search = async (q) => (await get(`/courses?q=${encodeURIComponent(q)}`)).json();
  assert.deepEqual(await search('보안'), [{ id: 'c1', title: '웹 보안 입문' }]);
  assert.deepEqual(await search('실습'), [{ id: 'c2', title: '시큐어 코딩 실습' }]);
  assert.deepEqual(await search('없는 제목'), []);
});

test('강의 검색: q가 비어 있으면 전체 목록', async () => {
  assert.equal((await (await get('/courses?q=')).json()).length, 2);
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

// 아래 5건은 결함 2(docs/v2-defects.md)를 잡는다. 번호는 docs/diagnosis/defect-2.md 3.4절의 그림과 같다.
test('수강생 명단 1: 토큰 없이 401', async () => {
  const res = await get('/courses/c1/enrollments');
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
});

test('수강생 명단 2: 학생은 자기가 신청한 강의여도 403', async () => {
  const res = await get('/courses/c1/enrollments', auth.student1);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'forbidden' });
});

test('수강생 명단 3: 다른 강의의 강사는 403', async () => {
  assert.equal((await get('/courses/c1/enrollments', auth.instructor2)).status, 403);
  assert.equal((await get('/courses/c2/enrollments', auth.instructor1)).status, 403);
});

test('수강생 명단 4: 없는 강의 id는 404', async () => {
  const res = await get('/courses/no-such-id/enrollments', auth.admin1);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('수강생 명단 5: 공개는 강의 목록 하나뿐이고 /courses 아래의 다른 경로는 토큰 없이 열리지 않음', async () => {
  assert.equal((await get('/courses')).status, 200);
  // 등록되지 않은 경로는 404가 맞으므로 401이 아니라 "200이 아니다"로 본다.
  for (const path of ['/courses/c1/enrollments', '/courses/c1/enrollments/', '/courses/c1', '/courses/x/y']) {
    assert.notEqual((await get(path)).status, 200, path);
  }
});
