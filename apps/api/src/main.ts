import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { requireEnv } from './config.js';

requireEnv('DATABASE_URL');

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// 응답 헤더로 프레임워크 이름을 알리지 않는다.
app.disable('x-powered-by');
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4000));
