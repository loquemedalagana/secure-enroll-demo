import { NextResponse } from 'next/server';
import { enrollments, users } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/policy';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(session, 'admin:read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = enrollments.map((e) => ({ ...e, username: users.find((u) => u.id === e.userId)?.username }));
  return NextResponse.json({ enrollments: rows });
}
