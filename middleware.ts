import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// [vulnerable 브랜치의 의도된 설계 결함]
// 인증(로그인 여부)만 확인하고, 역할(RBAC)과 소유자(ABAC)는 확인하지 않는다.
// 또한 이후 핸들러가 이 미들웨어만 믿고 별도 검증을 하지 않는다.
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/enrollments/:path*', '/api/enrollments/:path*'],
};
