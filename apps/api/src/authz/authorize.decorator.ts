import { SetMetadata } from '@nestjs/common';
import type { Action } from './policy.js';

export const AUTHORIZE = 'authz:rule';

// resource가 'enrollment'이면 인가 Guard가 경로의 :id로 DB에서 신청을 읽어,
// 신청자의 id(ownerId)와 담당 강사의 id(instructorId)를 can()에 넘긴다.
// 'course'이면 :id로 DB에서 강의를 읽어 담당 강사의 id(instructorId)를 can()에 넘긴다.
export type ResourceKind = 'enrollment' | 'course';
export type AuthorizeRule = { action: Action; resource?: ResourceKind };

// 핸들러에 붙여, 그 핸들러를 실행하려면 can()이 허용해야 하는 행위(action)를 적는다.
// 인가 Guard가 이 행위를 읽어 can()을 호출한다.
export const Authorize = (action: Action, options: { resource?: ResourceKind } = {}): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZE, { action, ...options } satisfies AuthorizeRule);
