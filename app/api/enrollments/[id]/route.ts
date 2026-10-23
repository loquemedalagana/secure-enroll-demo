import { NextResponse } from 'next/server';
import { courses, enrollments } from '@/lib/data';

// [vulnerable: BOLA/IDOR] 요청한 사람이 이 신청의 소유자인지 확인하지 않는다.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const enrollment = enrollments.find((e) => e.id === params.id);
  if (!enrollment) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const course = courses.find((c) => c.id === enrollment.courseId);
  return NextResponse.json({ enrollment, course });
}
