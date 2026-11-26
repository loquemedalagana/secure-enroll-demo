import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './current-user.js';
import { isPublic } from './is-public.js';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

// 인증 Guard. 모든 경로에 적용된다(app.module.ts). 공개 경로가 아니면 토큰을 요구한다.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) return true;

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
