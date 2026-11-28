import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 헬스 체크는 오케스트레이터가 토큰 없이 요청한다. 응답에는 status만 포함한다.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // 프로세스가 요청에 응답하는지만 확인한다. DB에는 쿼리를 보내지 않는다.
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  // DB에 SELECT 1을 실행한다. 실패하면 503으로 응답한다.
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
