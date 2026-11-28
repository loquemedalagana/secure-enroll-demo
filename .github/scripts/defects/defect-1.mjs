// 결함 1 재현: API가 Guard가 적용되지 않은 컨트롤러의 경로에 토큰 확인 없이 응답하는지 확인한다.
// 보고서: docs/diagnosis/defect-1.md
import { BASE, bearerFor, describe, finish, summarize } from './lib.mjs';

const path = '/admin/enrollments';

const anonymous = await summarize(await fetch(`${BASE}${path}`));
const student = await summarize(await fetch(`${BASE}${path}`, { headers: { authorization: await bearerFor('student1') } }));

finish(
  '결함 1: 전체 신청 목록(GET /admin/enrollments)의 인증·인가',
  [
    { request: `GET ${path} (토큰 없음)`, result: describe(anonymous) },
    { request: `GET ${path} (학생 토큰)`, result: describe(student) },
  ],
  // 관리자가 아닌 요청에 목록이 나오면 취약이다. 차단된 상태는 토큰 없음 401, 학생 403이다.
  anonymous.status === 200 || student.status === 200,
);
