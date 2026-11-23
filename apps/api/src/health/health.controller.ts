import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 헬스 체크는 오케스트레이터가 토큰 없이 호출한다. 상태 외의 정보는 돌려주지 않는다.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // 프로세스가 떠 있는지만 본다. DB 상태와 무관하다.
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  // 요청을 처리할 수 있는지 본다. DB에 쿼리가 닿지 않으면 503이다.
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
