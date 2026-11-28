import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

// 요청한 사람의 id와 역할이다. 인증 Guard가 토큰을 검증한 뒤 req.user = user를 실행한다.
// id는 토큰의 uid이고, role은 authenticate(token)이 DB에서 읽은 값이다.
export type AuthUser = { id: string; role: Role };
// can()에 넘긴 행위(action)와 can()의 결과(allowed)다. 인가 Guard가 can()을 호출한 뒤 req.authz = { action, allowed }를 실행한다.
// requestLog가 이 값을 읽어 요청 로그에 기록한다.
export type AuthzDecision = { action: string; allowed: boolean };
export type AuthedRequest = Request & { user?: AuthUser; authz?: AuthzDecision };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  // 인증 Guard가 req.user = user를 실행하지 않는 공개 경로의 핸들러에서 CurrentUser를 쓰면,
  // 아래 행이 Error를 던지고 API는 500으로 응답한다.
  if (!user) throw new Error('CurrentUser를 인증되지 않은 경로에서 사용했습니다.');
  return user;
});
