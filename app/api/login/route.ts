import { NextResponse } from 'next/server';
import { checkPassword } from '@/lib/data';
import { SESSION_COOKIE, createSession } from '@/lib/session';

export async function POST(req: Request) {
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
