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
  for (const name of ['student1', 'student2', 'student3', 'student4', 'student5', 'student6', 'instructor1', 'instructor2', 'admin1']) {
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
const PHONE = '010-0000-0003';
// who의 토큰으로 신청을 만든다. 본문에 신청자의 id는 없다. 신청자는 토큰의 사용자다.
const enroll = (who, courseId, extra = {}) => call('POST', '/enrollments', auth[who], { courseId, phone: PHONE, ...extra });
const countIn = async (courseId) =>
  Number((await db.query('select count(*) from enrollments where "courseId" = $1', [courseId])).rows[0].count);
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

test('신청 생성: 학생이 신청하면 201이고 자기 목록에 보임', async () => {
  const res = await enroll('student3', 'c4');
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const created = await res.json();
  assert.deepEqual(Object.keys(created).sort(), ['courseId', 'id', 'phone', 'userId']);
  assert.equal(created.userId, 'u3');
  assert.equal(created.courseId, 'c4');

  const mine = await (await call('GET', '/enrollments', auth.student3)).json();
  assert.deepEqual(mine.map((e) => e.id), [created.id]);
});

test('신청 생성: 같은 강의를 다시 신청하면 409', async () => {
  const res = await enroll('student3', 'c4');
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'conflict' });
  assert.equal(await countIn('c4'), 1);
});

test('신청 취소: 본인은 204이고 지워짐, 같은 취소를 다시 보내면 404', async () => {
  const [mine] = await (await call('GET', '/enrollments', auth.student3)).json();
  assert.equal((await call('DELETE', `/enrollments/${mine.id}`, auth.student3)).status, 204);
  assert.equal(await exists(mine.id), false);
  assert.equal((await call('DELETE', `/enrollments/${mine.id}`, auth.student3)).status, 404);
});

test('신청 취소: 관리자는 다른 사람의 신청도 204', async () => {
  const created = await (await enroll('student3', 'c4')).json();
  assert.equal((await call('DELETE', `/enrollments/${created.id}`, auth.admin1)).status, 204);
  assert.equal(await exists(created.id), false);
});

test('신청 생성: 토큰 없이 401, 강사와 관리자는 403', async () => {
  const body = { courseId: 'c4', phone: PHONE };
  assert.equal((await call('POST', '/enrollments', undefined, body)).status, 401);
  assert.equal((await call('POST', '/enrollments', auth.instructor1, body)).status, 403);
  assert.equal((await call('POST', '/enrollments', auth.admin1, body)).status, 403);
  assert.equal(await countIn('c4'), 0);
});

test('신청 생성: 없는 강의는 404', async () => {
  const res = await enroll('student3', 'no-such-course');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('신청 생성: 형식이 틀린 본문은 400', async () => {
  assert.equal((await enroll('student3', 'c4', { phone: '01000000003' })).status, 400);
  assert.equal((await enroll('student3', 'c4', { courseId: 4 })).status, 400);
  assert.equal((await enroll('student3', 'c4', { memo: '선언하지 않은 필드' })).status, 400);
  assert.equal((await call('POST', '/enrollments', auth.student3, {})).status, 400);
  assert.equal(await countIn('c4'), 0);
});

test('정원: 찬 강의에 신청하면 409', async () => {
  // c3의 정원은 1명이다.
  assert.equal((await enroll('student3', 'c3')).status, 201);
  const res = await enroll('student4', 'c3');
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'conflict' });
  assert.equal(await countIn('c3'), 1);
  await cleanup();
});

test('정원: 정원이 1명인 강의에 학생 4명이 동시에 신청하면 1명만 201', async () => {
  // 한 번으로는 우연히 통과할 수 있어서 여러 번 되풀이한다.
  for (let round = 0; round < 10; round++) {
    const results = await Promise.all(['student3', 'student4', 'student5', 'student6'].map((who) => enroll(who, 'c3')));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409], `${round + 1}번째`);
    assert.equal(await countIn('c3'), 1, `${round + 1}번째`);
    await cleanup();
  }
});

test('중복: 같은 학생이 같은 강의를 동시에 4번 신청하면 1건만 201', async () => {
  for (let round = 0; round < 10; round++) {
    const results = await Promise.all([1, 2, 3, 4].map(() => enroll('student3', 'c4')));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409], `${round + 1}번째`);
    assert.equal(await countIn('c4'), 1, `${round + 1}번째`);
    await cleanup();
  }
});

test('신청 생성: 본문에 userId를 넣으면 자기 id여도 400', async () => {
  // 본문은 신청자의 id를 받지 않는다. 선언하지 않은 필드라 거부된다.
  const res = await enroll('student3', 'c4', { userId: 'u3' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_request');
  assert.equal(await countIn('c4'), 0);
});

// 아래 3건은 결함 8(docs/v2-defects.md)을 잡는다. 번호는 docs/diagnosis/defect-8.md 3.4절의 그림과 같다.
// 요청한 사람(토큰)과 본문의 userId가 다른 요청을 보낸다. 거부하는 방식(400인지 403인지)은 정하지 않고,
// 다른 사람의 신청이 만들어지지 않았는지를 DB에서 확인한다.
const ownedBy = async (userId) =>
  Number((await db.query('select count(*) from enrollments where "userId" = $1 and id <> all($2)', [userId, SEEDED])).rows[0].count);
const createWith = (who, userId) => call('POST', '/enrollments', auth[who], { userId, courseId: 'c4', phone: PHONE });

test('신청 생성 1: 다른 학생의 id를 본문에 넣어도 그 학생의 신청이 만들어지지 않음', async () => {
  await cleanup();
  const res = await createWith('student3', 'u4');
  assert.equal(await ownedBy('u4'), 0, 'student4(u4)의 이름으로 만들어진 신청의 건수');
  assert.notEqual(res.status, 201, '상태 코드');
  await cleanup();
});

test('신청 생성 2: 관리자의 id를 본문에 넣어도 관리자의 신청이 만들어지지 않음', async () => {
  await cleanup();
  const res = await createWith('student3', 'a1');
  assert.equal(await ownedBy('a1'), 0, 'admin1(a1)의 이름으로 만들어진 신청의 건수');
  assert.notEqual(res.status, 201, '상태 코드');
  await cleanup();
});

test('신청 생성 3: 본문의 userId가 무엇이든 만들어진 신청의 소유자는 요청한 사람', async () => {
  await cleanup();
  // student3(u3)의 토큰 하나로, 본문의 userId만 바꿔 가며 보낸다.
  for (const userId of ['u3', 'u4', 'u5', 'i1', 'a1']) await createWith('student3', userId);
  const { rows } = await db.query('select "userId" from enrollments where id <> all($1)', [SEEDED]);
  const notMine = rows.filter((r) => r.userId !== 'u3').length;
  assert.equal(notMine, 0, '요청한 사람(u3)이 아닌 사용자의 이름으로 만들어진 신청의 건수');
  await cleanup();
});

// 권한 표(쓰기). 읽기 경로의 표는 permission-matrix.test.mjs에 있고, README의 권한 표와 같은 내용이다.
// 쓰기는 요청할 때마다 DB가 바뀌므로 칸마다 상태를 새로 만들고 지운다. c4의 담당 강사는 instructor2다.
test('권한 표: POST /enrollments → 비로그인 401, 학생 201, 강사 403, 관리자 403', async () => {
  const expected = { 비로그인: 401, student3: 201, student4: 201, instructor1: 403, instructor2: 403, admin1: 403 };
  for (const [who, status] of Object.entries(expected)) {
    await cleanup();
    assert.equal((await enroll(who, 'c4')).status, status, who);
  }
  await cleanup();
});

test('권한 표: DELETE /enrollments/:id → 비로그인 401, 본인 204, 다른 학생 403, 강사 403, 관리자 204', async () => {
  // 칸마다 student3이 c4를 새로 신청하고, 그 신청을 각자의 토큰으로 취소해 본다.
  const expected = { 비로그인: 401, student3: 204, student4: 403, instructor1: 403, instructor2: 403, admin1: 204 };
  for (const [who, status] of Object.entries(expected)) {
    await cleanup();
    const created = await (await enroll('student3', 'c4')).json();
    assert.equal((await call('DELETE', `/enrollments/${created.id}`, auth[who])).status, status, who);
    assert.equal(await exists(created.id), status !== 204, `${who}: 신청이 남아 있는지`);
  }
  await cleanup();
});
