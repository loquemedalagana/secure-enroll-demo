import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator.js';

// 요청이 라우팅된 핸들러가 공개 경로인지 판단한다. 인증 Guard와 인가 Guard가 이 함수를 호출한다.
// 핸들러나 컨트롤러에 @Public이 붙어 있는지만 확인한다. 요청의 주소는 비교하지 않는다.
export function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
  const marked = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
  return marked === true;
}
