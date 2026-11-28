// 더미 데이터를 DB에 저장하는 시드 스크립트다. 실제 사용자나 회사의 데이터가 아니다. v1의 인메모리 데이터와 같은 id와 값을 쓴다.
// 실행: npm run build && npm run db:seed (여러 번 실행해도 같은 상태가 된다)
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './auth/password.js';
import { requireEnv } from './config.js';
import { PrismaClient, type Role } from './generated/prisma/client.js';

const users: { id: string; username: string; role: Role }[] = [
  { id: 'u1', username: 'student1', role: 'student' },
  { id: 'u2', username: 'student2', role: 'student' },
  // u3~u6은 신청 생성·취소와 동시 신청 테스트가 쓴다. 시드에는 이들의 신청이 없다.
  { id: 'u3', username: 'student3', role: 'student' },
  { id: 'u4', username: 'student4', role: 'student' },
  { id: 'u5', username: 'student5', role: 'student' },
  { id: 'u6', username: 'student6', role: 'student' },
  { id: 'i1', username: 'instructor1', role: 'instructor' },
  { id: 'i2', username: 'instructor2', role: 'instructor' },
  { id: 'a1', username: 'admin1', role: 'admin' },
];

const courses = [
  { id: 'c1', title: '웹 보안 입문', instructorId: 'i1', capacity: 30 },
  { id: 'c2', title: '시큐어 코딩 실습', instructorId: 'i2', capacity: 30 },
  // c3, c4에는 시드의 신청이 없다. c3은 정원이 1명이라 동시 신청 테스트에 쓴다.
  { id: 'c3', title: '네트워크 기초', instructorId: 'i1', capacity: 1 },
  { id: 'c4', title: '데이터베이스 기초', instructorId: 'i2', capacity: 30 },
];

// phone은 개인정보(전화번호)의 예로 둔 더미 값이다.
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
  // 기존 행을 모두 삭제하고 시드의 행을 다시 추가한다. 트랜잭션 하나로 실행하므로, 중간에 실패하면 DB는 실행 전의 상태로 남는다.
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
