// can() 단위 테스트: 역할 × 행위 × 소유 여부. 앞의 16건은 v1(apps/web/tests/policy.test.mjs)과 같은 경우이고, 뒤의 5건은 API에 새로 생긴 행위다.
// 빌드한 결과물(dist/authz/policy.js)을 직접 불러온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, enrollmentScope } from '../dist/authz/policy.js';

const student = { id: 'u1', role: 'student' };
const instructor = { id: 'i1', role: 'instructor' };
const admin = { id: 'a1', role: 'admin' };

const mine = { ownerId: 'u1', instructorId: 'i1' };
const others = { ownerId: 'u2', instructorId: 'i2' };

const cases = [
  // [설명, 주체, 행위, 리소스, 기대값]
  ['비로그인 → 신청 조회', null, 'enrollment:read', mine, false],
  ['비로그인 → 관리자', null, 'admin:read', undefined, false],
  ['student → 본인 신청', student, 'enrollment:read', mine, true],
  ['student → 타인 신청', student, 'enrollment:read', others, false],
  ['student → 리소스 없음', student, 'enrollment:read', undefined, false],
  ['student → 관리자', student, 'admin:read', undefined, false],
  ['instructor → 자기 강의 신청', instructor, 'enrollment:read', mine, true],
  ['instructor → 타 강사 강의 신청', instructor, 'enrollment:read', others, false],
  ['instructor → 리소스 없음', instructor, 'enrollment:read', undefined, false],
  ['instructor → 관리자', instructor, 'admin:read', undefined, false],
  ['admin → 본인과 무관한 신청', admin, 'enrollment:read', others, true],
  ['admin → 리소스 없이 신청 조회', admin, 'enrollment:read', undefined, true],
  ['admin → 관리자', admin, 'admin:read', undefined, true],
  ['알 수 없는 역할', { id: 'x', role: 'guest' }, 'enrollment:read', mine, false],
  ['알 수 없는 행위', admin, 'enrollment:delete', mine, false],
  ['id가 소유자·강사와 다른 student가 강사 id만 일치', { id: 'i1', role: 'student' }, 'enrollment:read', mine, false],
  // API에 새로 생긴 행위
  ['비로그인 → 신청 목록', null, 'enrollment:list', undefined, false],
  ['student → 신청 목록(범위는 enrollmentScope가 정함)', student, 'enrollment:list', undefined, true],
  ['알 수 없는 역할 → 신청 목록', { id: 'x', role: 'guest' }, 'enrollment:list', undefined, false],
  ['student → 자기 정보', student, 'self:read', undefined, true],
  ['비로그인 → 자기 정보', null, 'self:read', undefined, false],
];

for (const [name, user, action, resource, expected] of cases) {
  test(`정책: ${name}`, () => assert.equal(can(user, action, resource), expected));
}

test('정책: 목록 범위는 학생은 자기 신청, 강사는 자기 강의, 관리자는 전체, 그 밖의 역할은 없음', () => {
  assert.deepEqual(enrollmentScope(student), { userId: 'u1' });
  assert.deepEqual(enrollmentScope(instructor), { course: { instructorId: 'i1' } });
  assert.deepEqual(enrollmentScope(admin), {});
  assert.equal(enrollmentScope({ id: 'x', role: 'guest' }), null);
});
