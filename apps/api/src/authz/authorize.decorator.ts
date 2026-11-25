import { SetMetadata } from '@nestjs/common';
import type { Action } from './policy.js';

export const AUTHORIZE = 'authz:rule';

// resource가 'enrollment'이면 인가 Guard가 경로의 :id로 신청을 찾아 소유자와 담당 강사를 정책에 넘긴다.
export type AuthorizeRule = { action: Action; resource?: 'enrollment' };

// 이 핸들러가 요구하는 행위를 선언한다. 판단은 인가 Guard가 can()에 물어서 한다.
export const Authorize = (action: Action, options: { resource?: 'enrollment' } = {}): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZE, { action, ...options } satisfies AuthorizeRule);
