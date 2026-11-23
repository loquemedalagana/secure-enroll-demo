import { redirect } from 'next/navigation';
import { courses, enrollments, users } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/policy';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session, 'admin:read')) return <main><h1>403 접근 권한 없음</h1></main>;

  return (
    <main>
      <h1>관리자 — 전체 신청 목록</h1>
      <table>
        <thead>
          <tr><th>신청</th><th>사용자</th><th>강의</th><th>연락처</th></tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.id}>
              <td>{e.id}</td>
              <td>{users.find((u) => u.id === e.userId)?.username}</td>
              <td>{courses.find((c) => c.id === e.courseId)?.title}</td>
              <td>{e.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
