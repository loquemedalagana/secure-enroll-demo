import { Module } from '@nestjs/common';
import { AuthzGuard } from '../authz/authz.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  // Guard는 보호할 컨트롤러에 @UseGuards로 붙인다.
  providers: [AuthService, AuthGuard, AuthzGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
