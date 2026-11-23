import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { requireEnv } from '../config.js';

// DB 연결은 첫 쿼리 때 맺는다. 시작 시점에 DB가 없어도 프로세스는 뜨고,
// 준비 상태는 /health/ready가 알려 준다.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
