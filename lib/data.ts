// 인메모리 더미 데이터. 실제 사용자·회사 데이터가 아님.
import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { Role } from './session';

const hash = (pw: string) => scryptSync(pw, 'demo-salt', 32);

export type User = { id: string; username: string; role: Role; passwordHash: Buffer };
export type Course = { id: string; title: string; instructorId: string };
export type Enrollment = { id: string; userId: string; courseId: string; phone: string };

export const users: User[] = [
  { id: 'u1', username: 'student1', role: 'student', passwordHash: hash('student1-pass') },
  { id: 'u2', username: 'student2', role: 'student', passwordHash: hash('student2-pass') },
  { id: 'i1', username: 'instructor1', role: 'instructor', passwordHash: hash('instructor1-pass') },
  { id: 'i2', username: 'instructor2', role: 'instructor', passwordHash: hash('instructor2-pass') },
  { id: 'a1', username: 'admin1', role: 'admin', passwordHash: hash('admin1-pass') },
];

export const courses: Course[] = [
  { id: 'c1', title: '웹 보안 입문', instructorId: 'i1' },
  { id: 'c2', title: '시큐어 코딩 실습', instructorId: 'i2' },
];

// phone은 더미 값 (개인정보 예시용)
export const enrollments: Enrollment[] = [
  { id: 'e1', userId: 'u1', courseId: 'c1', phone: '010-0000-0001' },
  { id: 'e2', userId: 'u2', courseId: 'c1', phone: '010-0000-0002' },
  { id: 'e3', userId: 'u2', courseId: 'c2', phone: '010-0000-0002' },
];

export function checkPassword(username: string, password: string): User | null {
  const user = users.find((u) => u.username === username);
  if (!user) return null;
  const a = hash(password);
  return a.length === user.passwordHash.length && timingSafeEqual(a, user.passwordHash) ? user : null;
}
