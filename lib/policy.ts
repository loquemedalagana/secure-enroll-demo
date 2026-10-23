import type { Role } from './session';

export type Subject = { uid: string; role: Role };
export type Action = 'enrollment:read' | 'admin:read';
// 신청 소유자(ownerId)와 해당 강의 강사(instructorId)는 호출 측이 채워서 넘긴다.
export type Resource = { ownerId: string; instructorId: string };

// 인가 판단은 여기 한 곳에서만 한다. 명시적으로 허용한 경우 외에는 거부.
export function can(user: Subject | null, action: Action, resource?: Resource): boolean {
  if (!user) return false;

  switch (action) {
    case 'admin:read':
      return user.role === 'admin';
    case 'enrollment:read':
      if (user.role === 'admin') return true;
      if (!resource) return false;
      if (user.role === 'student') return resource.ownerId === user.uid;
      if (user.role === 'instructor') return resource.instructorId === user.uid;
      return false;
    default:
      return false;
  }
}
