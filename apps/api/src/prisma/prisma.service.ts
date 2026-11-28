import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { requireEnv } from '../config.js';

// PrismaClient는 첫 쿼리를 실행할 때 DB에 접속한다. 그래서 API를 시작할 때 DB에 접속할 수 없어도 프로세스는 시작된다.
// API가 DB에 접속할 수 있는지는 /health/ready의 응답으로 확인한다.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
