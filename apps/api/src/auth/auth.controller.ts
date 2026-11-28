import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { Authorize } from '../authz/authorize.decorator.js';
import { AuthService, type LoginResult } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.js';
import { LoginDto } from './login.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // 토큰이 포함된 응답을 중간 캐시가 저장하지 않게 한다.
  @Header('Cache-Control', 'no-store')
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.username, body.password);
  }

  // 요청한 사람의 id와 역할로 응답한다.
  @Get('me')
  @Authorize('self:read')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return { id: user.id, role: user.role };
  }
}
