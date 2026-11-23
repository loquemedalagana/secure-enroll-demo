export const metadata = { title: 'secure-enroll-demo' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <p>
          <strong>교육용 데모 — 운영 사용 금지</strong>
        </p>
        {children}
      </body>
    </html>
  );
}
