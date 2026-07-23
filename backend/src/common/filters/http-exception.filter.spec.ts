import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    // Silence the Logger.error call the 500 branch makes so test output
    // stays clean — the assertions below still confirm no internals leak
    // into the actual HTTP response body.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('a validation-style BadRequestException with a string[] message is passed through verbatim (not flattened)', () => {
    const exception = new BadRequestException(['title should not be empty']);

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['title should not be empty'],
    });
  });

  it('a NotFoundException with a string message keeps `message` as a string', () => {
    const exception = new NotFoundException('Task with id "x" not found');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Task with id "x" not found',
    });
  });

  it('a generic unhandled Error maps to 500 with a generic message, leaking no internal details', () => {
    const exception = new Error('some internal secret detail');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });

    const [responseBody] = jsonMock.mock.calls[0] as [{ message: string }];
    expect(responseBody.message).not.toContain('secret detail');
  });
});
