export const metadata = { title: 'secure-enroll-demo' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <p>
          <strong>데모: 계정과 데이터는 모두 더미 값입니다</strong>
        </p>
        {children}
      </body>
    </html>
  );
}
