// can() 단위 테스트: 역할 × 행위 × 소유 여부
// Node 22.18+/24의 TS 타입 제거 기능으로 policy.ts를 직접 import한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can } from '../lib/policy.ts';

const student = { uid: 'u1', role: 'student' };
const instructor = { uid: 'i1', role: 'instructor' };
const admin = { uid: 'a1', role: 'admin' };

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
  ['알 수 없는 역할', { uid: 'x', role: 'guest' }, 'enrollment:read', mine, false],
  ['알 수 없는 행위', admin, 'enrollment:delete', mine, false],
  ['uid가 소유자·강사와 다른 student가 강사 id만 일치', { uid: 'i1', role: 'student' }, 'enrollment:read', mine, false],
];

for (const [name, user, action, resource, expected] of cases) {
  test(name, () => assert.equal(can(user, action, resource), expected));
}
