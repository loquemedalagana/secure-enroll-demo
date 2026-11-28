// 결함 2 재현: Guard가 경로의 앞부분만 비교해 공개 경로인지 판단한다.
// API가 앞부분이 같은 수강생 명단 요청에도 토큰 확인을 건너뛰고 응답하는지 확인한다.
// 보고서: docs/diagnosis/defect-2.md
import { BASE, bearerFor, describe, finish, summarize } from './lib.mjs';

const list = '/courses';
const roster = '/courses/c1/enrollments';

const publicList = await summarize(await fetch(`${BASE}${list}`));
const anonymous = await summarize(await fetch(`${BASE}${roster}`));
const student = await summarize(await fetch(`${BASE}${roster}`, { headers: { authorization: await bearerFor('student1') } }));
// c1의 담당 강사는 instructor1이다. instructor2는 다른 강의의 강사다.
const otherInstructor = await summarize(
  await fetch(`${BASE}${roster}`, { headers: { authorization: await bearerFor('instructor2') } }),
);

finish(
  '결함 2: 수강생 명단(GET /courses/:id/enrollments)의 인증·인가',
  [
    { request: `GET ${list} (토큰 없음, 공개가 맞음)`, result: describe(publicList) },
    { request: `GET ${roster} (토큰 없음)`, result: describe(anonymous) },
    { request: `GET ${roster} (학생 토큰)`, result: describe(student) },
    { request: `GET ${roster} (다른 강의의 강사 토큰)`, result: describe(otherInstructor) },
  ],
  // 담당 강사와 관리자가 아닌 요청에 명단이 나오면 취약이다. 차단된 상태는 토큰 없음 401, 나머지 403이다.
  anonymous.status === 200 || student.status === 200 || otherInstructor.status === 200,
);
