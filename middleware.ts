import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// 1차 관문(로그인 여부)일 뿐이다. 최종 인증·인가는 각 핸들러/페이지가 lib/policy.ts로 직접 판단한다.
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
