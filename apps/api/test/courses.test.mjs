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

test('강의 목록: API는 토큰 없는 요청에 200으로 응답하고, 응답의 강의마다 id와 제목만 있음', async () => {
  const res = await get('/courses');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [
    { id: 'c1', title: '웹 보안 입문' },
    { id: 'c2', title: '시큐어 코딩 실습' },
    { id: 'c3', title: '네트워크 기초' },
    { id: 'c4', title: '데이터베이스 기초' },
  ]);
});

test('강의 검색: 제목에 검색어가 들어 있는 강의만, 대소문자 구분 없이', async () => {
  const search = async (q) => (await get(`/courses?q=${encodeURIComponent(q)}`)).json();
  assert.deepEqual(await search('보안'), [{ id: 'c1', title: '웹 보안 입문' }]);
  assert.deepEqual(await search('실습'), [{ id: 'c2', title: '시큐어 코딩 실습' }]);
  assert.deepEqual(await search('암호학'), []);
});

test('강의 검색: q가 비어 있으면 전체 목록', async () => {
  assert.equal((await (await get('/courses?q=')).json()).length, 4);
});

// 검색어의 입력값 검증을 확인한다. 입력값 검증은 결함 6의 조치(prepared statement)와 따로 추가했다.
// API는 형식이 잘못된 요청에 400으로 응답하고 DB에 쿼리를 보내지 않는다.
test('강의 검색: q를 두 번 보내면 400', async () => {
  const res = await get(`/courses?q=${encodeURIComponent('보안')}&q=${encodeURIComponent('실습')}`);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_request');
});

test('강의 검색: 널 바이트가 포함된 검색어는 400', async () => {
  assert.equal((await get('/courses?q=%00')).status, 400);
  assert.equal((await get(`/courses?q=${encodeURIComponent('보안')}%00`)).status, 400);
});

test('강의 검색: 검색어는 100자까지', async () => {
  assert.equal((await get(`/courses?q=${'a'.repeat(100)}`)).status, 200);
  assert.equal((await get(`/courses?q=${'a'.repeat(101)}`)).status, 400);
});

test('강의 목록: 선언하지 않은 쿼리 문자열 필드를 보내면 400', async () => {
  assert.equal((await get('/courses?sort=title')).status, 400);
});

test('강의 검색: %와 _와 역슬래시는 와일드카드가 아니라 글자 그대로 찾음', async () => {
  const count = async (q) => (await (await get(`/courses?q=${encodeURIComponent(q)}`)).json()).length;
  assert.equal(await count('%'), 0);
  assert.equal(await count('_'), 0);
  assert.equal(await count('\\'), 0);
  // "웹 보안 입문"의 빈칸을 _로 바꾼 검색어다. LIKE가 _를 와일드카드로 읽으면 API는 1건으로 응답한다.
  assert.equal(await count('웹_보안'), 0);
  assert.equal(await count('웹 보안'), 1);
});

// 아래 5건은 결함 6(docs/v2-defects.md)을 잡는다. 번호는 docs/diagnosis/defect-6.md 3.4절의 그림과 같다.
// 결함 상태에서는 API가 다른 테이블의 값(비밀번호 해시, 전화번호)이 포함된 응답을 보낸다.
// assert.deepEqual은 실패할 때 비교한 두 값을 테스트 로그에 기록한다. 그래서 이 5건은 assert.deepEqual로 response body를
// 기댓값과 비교하지 않고, assert.equal로 상태 코드(status)와 행의 수(rows.length)만 비교한다.
const NO_MATCH = '암호학';
const INJECTIONS = {
  quote: "'",
  always: `${NO_MATCH}' OR '%'='`,
  users: `${NO_MATCH}' UNION SELECT username, "passwordHash" FROM users --`,
  enrollments: `${NO_MATCH}' UNION SELECT id, phone FROM enrollments --`,
};
// 검색 응답의 상태 코드와 행을 반환한다. response body가 배열이 아니면 rows는 null이고, count(rows)도 null이다.
async function searchSummary(q) {
  const res = await get(`/courses?q=${encodeURIComponent(q)}`);
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, rows: Array.isArray(body) ? body : null };
}
const count = (rows) => (rows === null ? null : rows.length);

test('강의 검색 1: 작은따옴표가 포함된 검색어도 오류 없이 200에 0건', async () => {
  const { status, rows } = await searchSummary(INJECTIONS.quote);
  assert.equal(status, 200, '상태 코드');
  assert.equal(count(rows), 0, '건수');
});

test('강의 검색 2: 검색어로 조건을 항상 참으로 만들 수 없음', async () => {
  const { status, rows } = await searchSummary(INJECTIONS.always);
  assert.equal(status, 200, '상태 코드');
  assert.equal(count(rows), 0, '암호학으로 검색했는데 응답에 포함된 강의의 건수');
});

test('강의 검색 3: 검색어로 사용자 테이블을 읽을 수 없음', async () => {
  const { status, rows } = await searchSummary(INJECTIONS.users);
  assert.equal(status, 200, '상태 코드');
  assert.equal(count(rows), 0, '응답에 포함된 행의 건수');
});

test('강의 검색 4: 검색어로 신청 테이블을 읽을 수 없음', async () => {
  const { status, rows } = await searchSummary(INJECTIONS.enrollments);
  assert.equal(status, 200, '상태 코드');
  assert.equal(count(rows), 0, '응답에 포함된 행의 건수');
});

test('강의 검색 5: 어떤 검색어든 응답의 모든 행은 제목에 그 검색어가 포함된 강의', async () => {
  const courses = await (await get('/courses')).json();
  for (const [name, q] of Object.entries({ normal: '보안', ...INJECTIONS })) {
    const { rows } = await searchSummary(q);
    const expected = courses.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).map((c) => c.id);
    const outside = (rows ?? []).filter((r) => !expected.includes(r.id)).length;
    assert.equal(outside, 0, `검색어 ${name}: 제목에 검색어가 없는데 응답에 포함된 행의 건수`);
    assert.equal(count(rows), expected.length, `검색어 ${name}: 건수`);
  }
});

test('수강생 명단: 담당 강사는 그 강의의 신청 전부', async () => {
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

test('수강생 명단 2: 학생은 본인이 신청한 강의여도 403', async () => {
  const res = await get('/courses/c1/enrollments', auth.student1);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'forbidden' });
});

test('수강생 명단 3: 다른 강의의 강사는 403', async () => {
  assert.equal((await get('/courses/c1/enrollments', auth.instructor2)).status, 403);
  assert.equal((await get('/courses/c2/enrollments', auth.instructor1)).status, 403);
});

test('수강생 명단 4: 존재하지 않는 강의 id는 404', async () => {
  const res = await get('/courses/no-such-id/enrollments', auth.admin1);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('수강생 명단 5: /courses로 시작하는 경로 가운데 API가 토큰 없는 요청에 200으로 응답하는 경로는 GET /courses 하나뿐임', async () => {
  assert.equal((await get('/courses')).status, 200);
  // 등록되지 않은 경로에는 API가 404로 응답하는 것이 정상이다. 그래서 상태 코드가 401인지가 아니라 200이 아닌지를 확인한다.
  for (const path of ['/courses/c1/enrollments', '/courses/c1/enrollments/', '/courses/c1', '/courses/x/y']) {
    assert.notEqual((await get(path)).status, 200, path);
  }
});
