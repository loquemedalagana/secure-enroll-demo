import { NextResponse } from 'next/server';
import { courses, enrollments } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/policy';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const enrollment = enrollments.find((e) => e.id === params.id);
  const course = courses.find((c) => c.id === enrollment?.courseId);
  if (!enrollment || !course) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const allowed = can(session, 'enrollment:read', { ownerId: enrollment.userId, instructorId: course.instructorId });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  return NextResponse.json({ enrollment, course });
}
