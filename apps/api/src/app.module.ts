import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ErrorResponseFilter } from './common/error-response.filter.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: ErrorResponseFilter },
    {
      // DTO에 선언하지 않은 필드가 오면 무시하지 않고 400으로 거부한다.
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule {}
