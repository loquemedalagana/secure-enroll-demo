import type { AuthUser } from '../auth/current-user.js';

// 인가 판단은 여기 한 곳에서만 한다. 명시적으로 허용한 경우 외에는 거부한다.
// v1(apps/web/lib/policy.ts)의 규칙을 그대로 옮기고, API에 새로 생긴 행위를 더했다.
//
// 규칙은 두 종류다.
// - 역할 규칙: 사용자의 역할만 본다. (관리자 목록은 admin만)
// - 속성 규칙: 사용자와 대상의 속성을 비교한다. (학생은 본인의 신청일 때, 강사는 담당 강의일 때)
export type Action =
  | 'enrollment:read' // 신청 한 건 조회
  | 'enrollment:list' // 요청한 사람이 볼 수 있는 신청 목록
  | 'roster:read' // 강의 하나의 수강생 명단
  | 'enrollment:create' // 신청 생성
  | 'enrollment:cancel' // 신청 한 건 취소
  | 'admin:read' // 전체 신청 목록
  | 'self:read'; // 본인의 id와 역할

// 신청자(ownerId)와 그 강의의 담당 강사(instructorId). 호출하는 쪽이 DB에서 읽어 채운다.
// 대상이 강의이면 신청자가 없으므로 instructorId만 채운다.
export type Resource = { ownerId?: string; instructorId: string };

const ROLES: readonly string[] = ['student', 'instructor', 'admin'];

export function can(user: AuthUser | null, action: Action, resource?: Resource): boolean {
  if (!user) return false;
  if (!ROLES.includes(user.role)) return false;

  switch (action) {
    case 'self:read':
    case 'enrollment:list':
      return true;
    case 'admin:read':
      return user.role === 'admin';
    case 'enrollment:read':
      if (user.role === 'admin') return true;
      if (!resource) return false;
      if (user.role === 'student') return resource.ownerId === user.id;
      if (user.role === 'instructor') return resource.instructorId === user.id;
      return false;
    case 'enrollment:create':
      // 학생은 본인의 이름으로만 신청한다. 강사와 관리자의 대리 신청은 없다.
      return user.role === 'student';
    case 'enrollment:cancel':
      // 취소는 신청자와 관리자만 한다. 담당 강사는 조회만 할 수 있다.
      if (user.role === 'admin') return true;
      if (!resource) return false;
      return user.role === 'student' && resource.ownerId === user.id;
    case 'roster:read':
      // 명단에는 그 강의 수강생 전원의 전화번호가 있다. 학생에게는 주지 않는다.
      if (user.role === 'admin') return true;
      if (!resource) return false;
      return user.role === 'instructor' && resource.instructorId === user.id;
    default:
      return false;
  }
}

// 목록 조회에 쓰는 범위. can(user, 'enrollment:read', 신청)이 참인 신청만 고르는 조건이다.
// 규칙이 바뀌면 can()과 함께 여기도 바꾼다(둘이 같은 결과를 내는지는 e2e 테스트가 확인한다).
export type EnrollmentScope = { userId: string } | { course: { instructorId: string } } | Record<string, never>;

export function enrollmentScope(user: AuthUser): EnrollmentScope | null {
  switch (user.role) {
    case 'admin':
      return {};
    case 'student':
      return { userId: user.id };
    case 'instructor':
      return { course: { instructorId: user.id } };
    default:
      return null;
  }
}
