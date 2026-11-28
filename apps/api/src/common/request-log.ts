import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from '../auth/current-user.js';

// 요청 로그 한 줄에 넣는 필드는 아래의 RequestLogLine 타입에만 적는다. 이 타입에 없는 필드는 요청 로그에 넣지 않는다.
// 헤더, request body, response body, 쿼리 문자열은 요청 로그에 넣지 않는다. 토큰, 비밀번호, 검색어가 이 네 곳에 들어 있기 때문이다.
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

// requestLog는 응답을 다 보낸 뒤(finish)에 요청 하나마다 JSON 한 줄을 서버 로그에 기록한다.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const id = randomUUID();
  // 요청 로그의 id와 같은 값을 응답의 X-Request-Id 헤더에 넣는다.
  // 서버에 접근할 수 있는 사람은 서버 로그에서 id가 X-Request-Id 헤더의 값과 같은 줄을 찾을 수 있다.
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    const line: RequestLogLine = {
      time: new Date().toISOString(),
      id,
      method: req.method,
      // originalUrl에서 '?'와 그 뒤의 쿼리 문자열을 뺀다.
      path: req.originalUrl.split('?')[0] ?? '',
      status: res.statusCode,
      ms: Date.now() - started,
    };
    // req.user가 있으면 user.id를 uid에 기록한다. 인증 Guard는 공개 경로의 요청과 401로 응답하는 요청에서
    // req.user = user를 실행하지 않는다. 그래서 이 두 요청의 로그에는 uid가 없다.
    const { user, authz } = req as AuthedRequest;
    if (user !== undefined) line.uid = user.id;
    // 인가 Guard가 can()에 넘긴 행위(action)와 can()의 결과(allowed)를 기록한다.
    // 인가 Guard가 can()을 호출하지 않은 요청(공개 경로, 401, 404)에는 두 필드가 없다.
    if (authz !== undefined) {
      line.action = authz.action;
      line.allowed = authz.allowed;
    }
    process.stdout.write(`${JSON.stringify(line)}\n`);
  });
  next();
}
