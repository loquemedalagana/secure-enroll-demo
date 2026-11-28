import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './current-user.js';
import { isPublic } from './is-public.js';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

// 인증 Guard는 모든 경로에 적용된다(app.module.ts). 공개 경로가 아닌 경로의 요청에 유효한 토큰이 없으면 401로 응답한다.
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
    // Authorization 헤더가 없는 요청, 헤더의 형식이 잘못된 요청, 서명이 맞지 않는 토큰, 만료된 토큰,
    // 존재하지 않는 사용자의 토큰을 구분하지 않고 모두 401로 응답한다.
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
