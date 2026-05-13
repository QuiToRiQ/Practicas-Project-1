import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Final boundary that prevents stack traces / internal error shapes from
 * leaking to clients. NestJS HttpExceptions pass through with their declared
 * status and body; anything else collapses to a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    this.log.error(`unhandled error on ${req.method} ${req.url}`, exception as Error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'internal server error' });
  }
}
