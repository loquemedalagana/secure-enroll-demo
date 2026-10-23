import { NextResponse } from 'next/server';
import { enrollments, users } from '@/lib/data';

// [vulnerable: 역할 확인 누락] 미들웨어의 로그인 확인만 믿는다.
export async function GET() {
  const rows = enrollments.map((e) => ({ ...e, username: users.find((u) => u.id === e.userId)?.username }));
  return NextResponse.json({ enrollments: rows });
}
