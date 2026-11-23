// 더미 시드. 실제 사용자·회사 데이터가 아니다. v1의 인메모리 데이터와 같은 id·값을 쓴다.
// 실행: npm run build && npm run db:seed (여러 번 실행해도 같은 상태가 된다)
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './auth/password.js';
import { requireEnv } from './config.js';
import { PrismaClient, type Role } from './generated/prisma/client.js';

const users: { id: string; username: string; role: Role }[] = [
  { id: 'u1', username: 'student1', role: 'student' },
  { id: 'u2', username: 'student2', role: 'student' },
  { id: 'i1', username: 'instructor1', role: 'instructor' },
  { id: 'i2', username: 'instructor2', role: 'instructor' },
  { id: 'a1', username: 'admin1', role: 'admin' },
];

const courses = [
  { id: 'c1', title: '웹 보안 입문', instructorId: 'i1' },
  { id: 'c2', title: '시큐어 코딩 실습', instructorId: 'i2' },
];

// phone은 더미 값(개인정보 예시용)
const enrollments = [
  { id: 'e1', userId: 'u1', courseId: 'c1', phone: '010-0000-0001' },
  { id: 'e2', userId: 'u2', courseId: 'c1', phone: '010-0000-0002' },
  { id: 'e3', userId: 'u2', courseId: 'c2', phone: '010-0000-0002' },
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }) });

try {
  // 더미 계정의 비밀번호는 "<username>-pass"다.
  const withHash = await Promise.all(
    users.map(async (u) => ({ ...u, passwordHash: await hashPassword(`${u.username}-pass`) })),
  );
  // 기존 행을 비우고 다시 넣는다. 한 트랜잭션이라 중간에 실패하면 이전 상태로 남는다.
  await prisma.$transaction([
    prisma.enrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.user.deleteMany(),
    prisma.user.createMany({ data: withHash }),
    prisma.course.createMany({ data: courses }),
    prisma.enrollment.createMany({ data: enrollments }),
  ]);
  console.log(`seed: users ${users.length}, courses ${courses.length}, enrollments ${enrollments.length}`);
} finally {
  await prisma.$disconnect();
}
