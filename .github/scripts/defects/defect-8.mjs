// 결함 8 재현: 신청 생성(POST /enrollments)이 누구의 신청인지를 request body의 userId에서 읽는지 본다.
// 보고서: docs/diagnosis/defect-8.md
// 응답의 전화번호는 출력하지 않는다. 상태 코드와 건수, 누구의 이름으로 신청됐는지만 출력한다.
// 재현하면서 생긴 신청은 끝날 때 관리자 계정(admin1)으로 취소한다. 신청은 본인과 관리자만 취소할 수 있는데, 이 신청들은 student1의 신청이 아니다.
import { BASE, bearerFor, finish } from './lib.mjs';

const student1 = await bearerFor('student1'); // id는 u1
const student2 = await bearerFor('student2'); // id는 u2
const admin = await bearerFor('admin1');

const countOf = async (authorization) => (await (await fetch(`${BASE}/enrollments`, { headers: { authorization } })).json()).length;

// student1의 토큰으로, request body의 userId만 바꿔 신청한다. c4는 시드에 신청이 없는 강의다.
const created = [];
async function createAs(userId) {
  const res = await fetch(`${BASE}/enrollments`, {
    method: 'POST',
    headers: { authorization: student1, 'content-type': 'application/json' },
    body: JSON.stringify({ userId, courseId: 'c4', phone: '010-0000-0009' }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (res.status === 201 && body?.id) created.push(body.id);
  return { status: res.status, owner: res.status === 201 ? body?.userId : undefined };
}
const describe = ({ status, owner }) => (owner ? `상태 ${status} · ${owner}의 이름으로 신청됨` : `상태 ${status} · 신청되지 않음`);

const before = await countOf(student2);
const asStudent2 = await createAs('u2');
const asAdmin = await createAs('a1');
const after = await countOf(student2);

for (const id of created) await fetch(`${BASE}/enrollments/${id}`, { method: 'DELETE', headers: { authorization: admin } });

finish(
  '결함 8: 신청 생성(POST /enrollments)의 신청자',
  [
    { request: 'POST /enrollments (student1의 토큰, request body의 userId: u2)', result: describe(asStudent2) },
    { request: 'POST /enrollments (student1의 토큰, request body의 userId: a1, 관리자의 id)', result: describe(asAdmin) },
    { request: 'GET /enrollments (student2의 토큰) 요청 전과 후', result: `${before}건 → ${after}건` },
  ],
  // 요청한 사람(u1)이 아닌 사용자의 이름으로 신청되면 취약이다.
  [asStudent2, asAdmin].some((r) => r.owner !== undefined && r.owner !== 'u1') || after > before,
);
