import { cookies } from 'next/headers';
import { courses, enrollments } from '@/lib/data';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MyEnrollments() {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  const mine = enrollments.filter((e) => e.userId === session?.uid);

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
