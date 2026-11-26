import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator.js';

// 이 요청을 처리할 핸들러가 로그인 없이 열어 둔 것인지 판단한다. 인증 Guard와 인가 Guard가 같이 쓴다.
// 핸들러나 컨트롤러에 붙인 @Public만 본다. 주소의 글자는 보지 않는다.
export function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
  const marked = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
  return marked === true;
}
