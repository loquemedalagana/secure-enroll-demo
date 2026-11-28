import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { requestLog } from './common/request-log.js';
import { requireEnv, requireSecret } from './config.js';

requireEnv('DATABASE_URL');
requireSecret('TOKEN_SECRET');

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// 응답에 X-Powered-By 헤더를 포함하지 않는다. 이 헤더에는 프레임워크 이름이 들어 있다.
app.disable('x-powered-by');
app.use(requestLog);
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4000));
