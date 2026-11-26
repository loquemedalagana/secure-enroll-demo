import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';

// 로그인 없이 여는 경로. 이 값으로 시작하는 경로는 공개다.
const PUBLIC_PREFIXES: readonly string[] = ['/courses'];

// 이 요청이 공개 경로로 가는지 판단한다. 인증 Guard와 인가 Guard가 같이 쓴다.
export function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
  const marked = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
  if (marked === true) return true;

  const { path } = context.switchToHttp().getRequest<Request>();
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}
