import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * The single JSON shape every error response uses across the whole API.
 * `errors` is reserved for future field-level detail but is intentionally
 * left unpopulated/omitted for now (STORY-004) — `message` already carries
 * ValidationPipe's per-field strings, so populating both would duplicate
 * the same information.
 */
export interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  errors?: Record<string, string[]>;
}

/**
 * Global exception filter (registered in main.ts via
 * `app.useGlobalFilters(...)`) so every route returns errors in one
 * consistent shape instead of ad hoc, route-local error responses.
 *
 * `@Catch()` with no argument catches EVERYTHING, not just `HttpException` —
 * that's deliberate: an unhandled/unexpected error (a bug, not a client
 * error) still has to map to a safe 500 instead of leaking a stack trace
 * or internal error message to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json(this.buildBody(statusCode, exception));
      return;
    }

    // Not an HttpException => an unhandled/unexpected error. Log the real
    // error server-side (never returned to the client) and respond with a
    // generic 500.
    this.logger.error(exception instanceof Error ? exception.stack : exception);

    const body: ErrorResponseBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private buildBody(
    statusCode: number,
    exception: HttpException,
  ): ErrorResponseBody {
    const exceptionResponse = exception.getResponse();

    // Nest's built-in exceptions (BadRequestException from ValidationPipe,
    // NotFoundException, ConflictException, ...) respond with an object
    // shaped like `{ statusCode, message, error }` — pass `message` through
    // VERBATIM (a string[] stays a string[]) instead of flattening it, so
    // per-field validation messages (e.g. naming "title") survive intact.
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      return {
        statusCode,
        message: (exceptionResponse as { message: string | string[] }).message,
      };
    }

    // A plain string response, e.g. `throw new HttpException('X', 400)`.
    return {
      statusCode,
      message:
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exception.message,
    };
  }
}
