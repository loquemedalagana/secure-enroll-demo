import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './current-user.js';
import { IS_PUBLIC } from './public.decorator.js';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

// 전역 인증 Guard. @Public이 붙지 않은 모든 경로에서 토큰을 요구한다.
// 새 경로를 만들 때 아무것도 붙이지 않으면 닫힌 상태가 된다.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    // 헤더 없음, 형식 오류, 서명 불일치, 만료, 없는 사용자를 구분하지 않고 같은 401을 낸다.
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
