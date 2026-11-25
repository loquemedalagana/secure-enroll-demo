import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzGuard } from '../authz/authz.guard.js';
import { AdminController } from './admin.controller.js';
import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EnrollmentsController, AdminController],
  providers: [EnrollmentsService, AuthzGuard],
})
export class EnrollmentsModule {}
