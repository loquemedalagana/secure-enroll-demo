import type { NextFunction, Request, Response } from 'express';

// 요청이 끝날 때마다 한 줄을 남긴다: 메서드, 주소, 상태 코드, 걸린 시간.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
