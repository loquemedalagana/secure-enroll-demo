import { courses, enrollments, users } from '@/lib/data';

export const dynamic = 'force-dynamic';

// [vulnerable] 미들웨어의 로그인 확인만 믿고 역할 확인을 하지 않는다.
export default function AdminPage() {
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
