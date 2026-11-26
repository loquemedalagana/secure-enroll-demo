import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthzGuard } from './authz/authz.guard.js';
import { ErrorResponseFilter } from './common/error-response.filter.js';
import { CoursesModule } from './courses/courses.module.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, EnrollmentsModule, CoursesModule],
  providers: [
    { provide: APP_FILTER, useClass: ErrorResponseFilter },
    // 모든 경로에 적용한다. 적은 순서대로 돈다: 인증 다음에 인가.
    // 공개 경로는 auth/is-public.ts가 정한다.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AuthzGuard },
    {
      // DTO에 선언하지 않은 필드가 오면 무시하지 않고 400으로 거부한다.
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule {}
