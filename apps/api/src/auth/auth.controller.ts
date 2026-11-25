import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Authorize } from '../authz/authorize.decorator.js';
import { AuthzGuard } from '../authz/authz.guard.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService, type LoginResult } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.js';
import { LoginDto } from './login.dto.js';
import { Public } from './public.decorator.js';

@UseGuards(AuthGuard, AuthzGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // 토큰이 담긴 응답을 중간 캐시가 보관하지 않게 한다.
  @Header('Cache-Control', 'no-store')
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.username, body.password);
  }

  // 토큰의 주인이 누구이고 지금 역할이 무엇인지 돌려준다.
  @Get('me')
  @Authorize('self:read')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return { id: user.id, role: user.role };
  }
}
