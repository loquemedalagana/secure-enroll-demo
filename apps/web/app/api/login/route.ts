import { NextResponse } from 'next/server';
import { checkPassword } from '@/lib/data';
import { SESSION_COOKIE, createSession } from '@/lib/session';

// Origin이 있으면 같은 호스트에서 온 요청인지 본다. 브라우저는 교차 출처 POST에 Origin을 붙인다.
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false; // "null" 등 해석할 수 없는 Origin은 거부
  }
}

export async function POST(req: Request) {
  // 로그인 CSRF 방어: 다른 사이트의 폼은 application/json 본문을 보낼 수 없다(보내려면 CORS 사전 요청이 필요).
  const type = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return NextResponse.json({ error: 'unsupported media type' }, { status: 415 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const user = typeof body?.username === 'string' && typeof body?.password === 'string'
    ? checkPassword(body.username, body.password)
    : null;
  if (!user) return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });

  const token = await createSession({ uid: user.id, role: user.role });
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 60 * 60,
  });
  return res;
}
