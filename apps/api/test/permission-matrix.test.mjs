// 권한 표 테스트 (HTTP 수준, 실제 PostgreSQL)
// 경로마다 누가 요청하면 어떤 상태 코드가 나와야 하는지를 표 하나로 적고, 칸을 전부 요청해 본다.
// README의 권한 표와 같은 내용이다. 표를 고치면 README도 같이 고친다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

// 시드: student1(u1)은 e1을, student2(u2)는 e2·e3을 신청했다.
// 강의 c1(e1, e2)의 담당은 instructor1, c2(e3)의 담당은 instructor2다.
const WHO = ['비로그인', 'student1', 'student2', 'instructor1', 'instructor2', 'admin1'];

const MATRIX = [
  // [경로, 비로그인, student1, student2, instructor1, instructor2, admin1]
  ['/health/live', 200, 200, 200, 200, 200, 200],
  ['/courses', 200, 200, 200, 200, 200, 200],
  ['/auth/me', 401, 200, 200, 200, 200, 200],
  ['/enrollments', 401, 200, 200, 200, 200, 200],
  ['/enrollments/e1', 401, 200, 403, 200, 403, 200],
  ['/enrollments/e3', 401, 403, 200, 403, 200, 200],
  ['/courses/c1/enrollments', 401, 403, 403, 200, 403, 200],
  ['/courses/c2/enrollments', 401, 403, 403, 403, 200, 200],
  ['/admin/enrollments', 401, 403, 403, 403, 403, 200],
];

let server;
const auth = {};
before(async () => {
  server = await startServer(4192);
  for (const name of WHO.slice(1)) auth[name] = await bearerFor(server.base, name);
});
after(async () => {
  await server?.stop();
});

const get = (path, who) => fetch(`${server.base}${path}`, { headers: auth[who] ? { authorization: auth[who] } : {} });

for (const [path, ...expected] of MATRIX) {
  test(`권한 표: GET ${path} → ${expected.join(' ')}`, async () => {
    const actual = [];
    for (const who of WHO) actual.push((await get(path, who)).status);
    // 어느 칸이 다른지 보이도록 이름을 붙여 비교한다.
    assert.deepEqual(Object.fromEntries(WHO.map((who, i) => [who, actual[i]])), Object.fromEntries(WHO.map((who, i) => [who, expected[i]])));
  });
}

test('권한 표: 사용자마다 신청 목록에 포함된 신청과 한 건 조회가 허용되는 신청이 같음', async () => {
  // 목록의 범위(enrollmentScope)와 한 건의 판단(can)은 코드가 따로다. 둘이 어긋나지 않는지 본다.
  for (const who of WHO.slice(1)) {
    const listed = (await (await get('/enrollments', who)).json()).map((e) => e.id).sort();
    const readable = [];
    for (const id of ['e1', 'e2', 'e3']) {
      if ((await get(`/enrollments/${id}`, who)).status === 200) readable.push(id);
    }
    assert.deepEqual(listed, readable, who);
  }
});
