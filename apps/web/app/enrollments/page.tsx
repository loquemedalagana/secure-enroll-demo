import { redirect } from 'next/navigation';
import { courses, enrollments } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/policy';

export const dynamic = 'force-dynamic';

export default async function MyEnrollments() {
  const session = await getSession();
  if (!session) redirect('/login');

  // 본인 신청만 노출 (소유자 기준)
  const mine = enrollments.filter((e) => {
    const course = courses.find((c) => c.id === e.courseId);
    return e.userId === session.uid && can(session, 'enrollment:read', { ownerId: e.userId, instructorId: course?.instructorId ?? '' });
  });

  return (
    <main>
      <h1>내 신청 내역</h1>
      <ul>
        {mine.map((e) => (
          <li key={e.id}>
            {courses.find((c) => c.id === e.courseId)?.title} — <a href={`/api/enrollments/${e.id}`}>상세(JSON)</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
