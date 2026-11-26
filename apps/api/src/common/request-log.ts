import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from '../auth/current-user.js';

// 요청 로그 한 줄에 들어가는 필드는 여기서만 정한다.
// 헤더, 요청 본문, 응답 본문, 쿼리 문자열은 넣지 않는다. 토큰, 비밀번호, 검색어 같은 입력이 거기에 있다.
type RequestLogLine = {
  time: string;
  id: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  uid?: string;
  action?: string;
  allowed?: boolean;
};

// 요청이 끝날 때마다 JSON 한 줄을 남긴다.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const id = randomUUID();
  // 같은 id를 응답 헤더로도 돌려준다. 요청을 보낸 쪽이 알려 준 id로 로그의 그 줄을 찾을 수 있다.
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    const line: RequestLogLine = {
      time: new Date().toISOString(),
      id,
      method: req.method,
      // originalUrl에서 '?' 뒤를 뺀다.
      path: req.originalUrl.split('?')[0] ?? '',
      status: res.statusCode,
      ms: Date.now() - started,
    };
    // 인증 Guard가 확인한 사용자의 id. 인증 전에 끝난 요청에는 없다.
    const { user, authz } = req as AuthedRequest;
    if (user !== undefined) line.uid = user.id;
    // 인가 Guard가 can()에 물은 행위와 그 결과. 판단까지 가지 않은 요청(공개 경로, 401, 404)에는 없다.
    if (authz !== undefined) {
      line.action = authz.action;
      line.allowed = authz.allowed;
    }
    process.stdout.write(`${JSON.stringify(line)}\n`);
  });
  next();
}
