import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { AuthService, type LoginResult } from './auth.service.js';
import { LoginDto } from './login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  // 토큰이 담긴 응답을 중간 캐시가 보관하지 않게 한다.
  @Header('Cache-Control', 'no-store')
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.username, body.password);
  }
}
