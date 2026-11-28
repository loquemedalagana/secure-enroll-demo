import type { AuthUser } from '../auth/current-user.js';

// 인가 판단은 이 파일의 can()에서만 한다. can()은 아래 규칙이 허용한 경우에만 true를 반환하고, 그 밖에는 false를 반환한다.
// v1(apps/web/lib/policy.ts)의 규칙을 그대로 옮기고, API에 새로 추가한 행위의 규칙을 추가했다.
//
// 규칙은 두 종류다.
// - 역할 규칙: 사용자의 역할(user.role)만 비교한다. 예: admin:read는 admin만 허용한다.
// - 속성 규칙: 사용자의 id와 대상의 속성(ownerId, instructorId)을 비교한다.
//   예: 학생은 resource.ownerId === user.id일 때, 강사는 resource.instructorId === user.id일 때 허용한다.
export type Action =
  | 'enrollment:read' // 신청 한 건 조회
  | 'enrollment:list' // 요청한 사람이 조회할 수 있는 신청 목록
  | 'roster:read' // 강의 하나의 수강생 명단
  | 'enrollment:create' // 신청 생성
  | 'enrollment:cancel' // 신청 한 건 취소
  | 'admin:read' // 전체 신청 목록
  | 'self:read'; // 본인의 id와 역할

// can()이 비교하는 대상의 속성이다. ownerId는 신청자의 id이고, instructorId는 그 신청의 강의를 담당하는 강사의 id다.
// 인가 Guard가 DB에서 읽어 can()에 넘긴다. 대상이 강의이면 신청자가 없으므로 instructorId만 넘긴다.
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
      // 신청은 student만 할 수 있다. 강사와 관리자가 학생 대신 신청하는 기능은 없다.
      return user.role === 'student';
    case 'enrollment:cancel':
      // 취소는 신청자와 관리자만 한다. 담당 강사는 조회만 할 수 있다.
      if (user.role === 'admin') return true;
      if (!resource) return false;
      return user.role === 'student' && resource.ownerId === user.id;
    case 'roster:read':
      // 명단에는 그 강의 수강생 전원의 전화번호가 들어 있다. 그래서 학생의 요청은 허용하지 않는다.
      if (user.role === 'admin') return true;
      if (!resource) return false;
      return user.role === 'instructor' && resource.instructorId === user.id;
    default:
      return false;
  }
}

// 신청 목록을 조회할 때 DB 쿼리에 포함하는 조건이다. can(user, 'enrollment:read', 신청)이 true인 신청만 고른다.
// enrollment:read 규칙을 변경하면 enrollmentScope()도 함께 변경한다.
// 두 함수의 결과가 같은지는 permission-matrix.test.mjs가 확인한다.
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
