import { createHmac, timingSafeEqual } from 'node:crypto';

// 토큰 형식: <페이로드 base64url>.<서명 base64url>
// 페이로드는 { uid, exp }뿐이다. 역할은 넣지 않고 요청마다 DB에서 읽는다(역할이 바뀌면 바로 반영된다).
// 서명은 HMAC-SHA256이고 키는 API에만 있다.
export const TOKEN_TTL_SECONDS = 60 * 60;

export type TokenPayload = { uid: string; exp: number };

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function issueToken(uid: string, secret: string, nowMs: number = Date.now()): string {
  const payload: TokenPayload = { uid, exp: Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

// 형식이 깨졌거나, 서명이 맞지 않거나, 만료됐으면 null이다. 이유는 구분해서 돌려주지 않는다.
export function verifyToken(token: string, secret: string, nowMs: number = Date.now()): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  if (!body || !signature) return null;

  // 서명을 먼저 확인한다. 서명이 맞지 않는 페이로드는 해석하지 않는다.
  const expected = sign(body, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { uid, exp } = payload as Record<string, unknown>;
  if (typeof uid !== 'string' || uid === '') return null;
  if (typeof exp !== 'number' || !Number.isInteger(exp)) return null;
  if (exp <= Math.floor(nowMs / 1000)) return null;
  return { uid, exp };
}
