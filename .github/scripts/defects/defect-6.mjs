// 결함 6 재현: 강의 검색(GET /courses?q=)의 검색어가 쿼리의 일부로 실행되는지 본다.
// 보고서: docs/diagnosis/defect-6.md
// 응답에 다른 테이블의 값(비밀번호 해시, 전화번호)이 들어올 수 있으므로 값은 출력하지 않고 건수만 센다.
import { BASE, finish } from './lib.mjs';

// 시드의 더미 데이터. 응답의 행이 어느 테이블에서 왔는지 가리는 데만 쓴다.
const COURSE_IDS = ['c1', 'c2'];
const USERNAMES = ['student1', 'student2', 'instructor1', 'instructor2', 'admin1'];
const ENROLLMENT_IDS = ['e1', 'e2', 'e3'];

async function search(q) {
  const res = await fetch(`${BASE}/courses?q=${encodeURIComponent(q)}`);
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, rows: Array.isArray(body) ? body : [] };
}

const count = (rows, ids) => rows.filter((r) => ids.includes(r.id)).length;
const describe = ({ status, rows }, extra = '') => `상태 ${status} · ${rows.length}건${extra}`;

// 1. 기준: 제목에 없는 말로 찾으면 0건이어야 한다.
const none = await search('없는 제목');
// 2. 작은따옴표 하나. 검색어가 쿼리 문자열에 그대로 들어가면 문법 오류가 난다.
const quote = await search("'");
// 3. 조건을 항상 참으로 만든다. 제목에 없는 말인데 강의가 전부 나오면 조건이 바뀐 것이다.
// 검색어 뒤에 붙는 %'까지 문자열 비교의 일부가 되게 맞춘다: … OR '%'='%'
const always = await search("없는 제목' OR '%'='");
// 4. 다른 테이블을 합친다. 로그인 없이 사용자 테이블과 신청 테이블을 읽는다.
const users = await search(`없는 제목' UNION SELECT username, "passwordHash" FROM users --`);
const enrollments = await search(`없는 제목' UNION SELECT id, phone FROM enrollments --`);

const leakedUsers = count(users.rows, USERNAMES);
const leakedEnrollments = count(enrollments.rows, ENROLLMENT_IDS);

finish(
  '결함 6: 강의 검색(GET /courses?q=)의 검색어 처리',
  [
    { request: '검색어: 제목에 없는 말 (토큰 없음, 0건이 맞음)', result: describe(none) },
    { request: "검색어: 작은따옴표 하나 (')", result: describe(quote) },
    {
      request: "검색어: 제목에 없는 말 + ' OR '%'='",
      result: describe(always, ` · 강의 ${count(always.rows, COURSE_IDS)}건`),
    },
    {
      request: '검색어: 제목에 없는 말 + UNION SELECT … FROM users',
      result: describe(users, ` · 사용자 테이블에서 온 행 ${leakedUsers}건(계정 이름과 비밀번호 해시)`),
    },
    {
      request: '검색어: 제목에 없는 말 + UNION SELECT … FROM enrollments',
      result: describe(enrollments, ` · 신청 테이블에서 온 행 ${leakedEnrollments}건(신청 id와 전화번호)`),
    },
  ],
  // 검색어가 조건을 바꾸거나 다른 테이블의 행을 가져오면 취약이다. 차단된 상태는 전부 200에 0건이다.
  always.rows.length > 0 || leakedUsers > 0 || leakedEnrollments > 0 || quote.status >= 500,
);
