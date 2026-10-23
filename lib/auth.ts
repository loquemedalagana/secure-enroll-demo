import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session';

// 미들웨어와 별개로 각 진입점에서 세션 쿠키를 직접 다시 검증한다.
export async function getSession() {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}
