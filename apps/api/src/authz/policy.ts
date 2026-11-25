import type { AuthUser } from '../auth/current-user.js';

// 인가 판단은 여기 한 곳에서만 한다. 명시적으로 허용한 경우 외에는 거부한다.
// v1(apps/web/lib/policy.ts)의 규칙을 그대로 옮겼다.
//
// 규칙은 두 종류다.
// - 역할 규칙: 사용자의 역할만 본다. (관리자 목록은 admin만)
// - 속성 규칙: 사용자와 대상의 속성을 비교한다. (학생은 신청의 소유자일 때, 강사는 그 강의의 담당 강사일 때)
export type Action = 'enrollment:read' | 'admin:read';

// 신청의 소유자(ownerId)와 그 강의의 담당 강사(instructorId). 호출하는 쪽이 DB에서 읽어 채운다.
export type Resource = { ownerId: string; instructorId: string };

export function can(user: AuthUser | null, action: Action, resource?: Resource): boolean {
  if (!user) return false;

  switch (action) {
    case 'admin:read':
      return user.role === 'admin';
    case 'enrollment:read':
      if (user.role === 'admin') return true;
      if (!resource) return false;
      if (user.role === 'student') return resource.ownerId === user.id;
      if (user.role === 'instructor') return resource.instructorId === user.id;
      return false;
    default:
      return false;
  }
}
