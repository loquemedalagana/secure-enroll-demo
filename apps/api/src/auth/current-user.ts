import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

// 인증 Guard가 요청에 붙이는 사용자 정보. id는 토큰에서, role은 그 요청 시점의 DB에서 온다.
export type AuthUser = { id: string; role: Role };
// 인가 Guard가 판단을 마친 요청에 붙이는 결과. 요청 로그가 읽는다.
export type AuthzDecision = { action: string; allowed: boolean };
export type AuthedRequest = Request & { user?: AuthUser; authz?: AuthzDecision };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  // 인증 Guard가 req.user = user를 실행하지 않는 공개 경로의 핸들러에서 CurrentUser를 쓰면,
  // 아래 줄이 Error를 던지고 API는 500으로 응답한다.
  if (!user) throw new Error('CurrentUser를 인증되지 않은 경로에서 사용했습니다.');
  return user;
});
