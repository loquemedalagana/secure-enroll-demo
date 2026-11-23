import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma CLI는 .env를 자동으로 읽지 않는다. 로컬에서는 .env가 있으면 읽고, CI에서는 환경 변수를 그대로 쓴다.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
