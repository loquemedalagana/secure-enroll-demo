import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

// 모든 오류 응답은 { "error": "<코드>" } 한 가지 형식이다.
// 스택, 내부 경로, 예외 메시지는 응답에 넣지 않고 서버 로그에만 남긴다.
const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'too_many_requests',
  503: 'service_unavailable',
};

type ErrorBody = { error: string; details?: string[] };

@Catch()
export class ErrorResponseFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorResponse');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500 && status !== 503) {
        this.logger.error(exception.stack ?? exception.message);
        res.status(status).json({ error: 'internal_error' } satisfies ErrorBody);
        return;
      }
      const body: ErrorBody = { error: CODES[status] ?? 'request_error' };
      // 입력 검증 실패만 어느 필드가 왜 틀렸는지 알려 준다. 검증 규칙이 만든 문구이고 입력값은 포함하지 않는다.
      const detail = exception.getResponse();
      if (status === 400 && typeof detail === 'object' && detail !== null) {
        const message = (detail as { message?: unknown }).message;
        if (Array.isArray(message) && message.every((m) => typeof m === 'string')) body.details = message;
      }
      res.status(status).json(body);
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res.status(500).json({ error: 'internal_error' } satisfies ErrorBody);
  }
}
