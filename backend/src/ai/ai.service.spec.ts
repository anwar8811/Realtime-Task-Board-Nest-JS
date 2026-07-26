import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { SummarizeDto } from './dto/summarize.dto';

// Never a real key format like OpenRouter's ("sk-or-...") on purpose, so the
// "message never contains a substring of the fake key" assertions below are
// meaningful rather than trivially true.
const FAKE_API_KEY = 'test-fake-openrouter-key-abc123';
const FAKE_MODEL = 'test/model:free';
const FRONTEND_ORIGIN = 'http://localhost:3001';

function makeConfigService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    OPENROUTER_API_KEY: FAKE_API_KEY,
    OPENROUTER_MODEL: FAKE_MODEL,
    FRONTEND_ORIGIN,
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown, ok = status < 300) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('AiService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const dto: SummarizeDto = { title: 'Fix the login bug' };

  describe('success path', () => {
    it('returns the generated description from a realistic OpenRouter success body', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { content: 'A generated description.' } }],
        }),
      );

      const service = new AiService(makeConfigService());
      const result = await service.summarize(dto);

      expect(result).toEqual({ description: 'A generated description.' });
    });

    it('sends the expected URL, headers, model, and prompt structure', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { content: 'A generated description.' } }],
        }),
      );

      const service = new AiService(makeConfigService());
      await service.summarize(dto);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(init.method).toBe('POST');

      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${FAKE_API_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['HTTP-Referer']).toBe(FRONTEND_ORIGIN);
      expect(headers['X-Title']).toBe('Realtime Task Board');

      const body = JSON.parse(init.body as string) as {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe(FAKE_MODEL);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(200);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toContain('Title: Fix the login bug');
    });

    it('includes an "Existing description:" line only when description is provided', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { content: 'A generated description.' } }],
        }),
      );

      const service = new AiService(makeConfigService());

      await service.summarize({ title: 'Fix the login bug' });
      const withoutDescriptionBody = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      ) as { messages: Array<{ content: string }> };
      expect(withoutDescriptionBody.messages[1].content).not.toContain(
        'Existing description:',
      );

      await service.summarize({
        title: 'Fix the login bug',
        description: 'Users cannot log in on Safari.',
      });
      const withDescriptionBody = JSON.parse(
        (fetchSpy.mock.calls[1][1] as RequestInit).body as string,
      ) as { messages: Array<{ content: string }> };
      expect(withDescriptionBody.messages[1].content).toContain(
        'Existing description: Users cannot log in on Safari.',
      );
    });
  });

  describe('error mapping', () => {
    it('maps a fetch AbortError to 504 GatewayTimeoutException', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      const service = new AiService(makeConfigService());

      await expect(service.summarize(dto)).rejects.toThrow(
        GatewayTimeoutException,
      );
    });

    it('maps a non-2xx 503 upstream response to 502 with the generic message (not the upstream body)', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(503, { error: 'upstream is down, secret internals X' }),
      );

      const service = new AiService(makeConfigService());

      try {
        await service.summarize(dto);
        fail('expected summarize to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        const message = (error as BadGatewayException).message;
        expect(message).toBe('AI summarisation is currently unavailable.');
        expect(message).not.toContain('upstream is down');
      }
    });

    it('maps a 429 upstream response to 502 with the rate-limit message', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(429, { error: 'rate limited' }));

      const service = new AiService(makeConfigService());

      try {
        await service.summarize(dto);
        fail('expected summarize to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect((error as BadGatewayException).message).toBe(
          'AI service is rate-limited. Try again shortly.',
        );
      }
    });

    it('maps a 504 upstream response to 504 (same message as a client-side timeout)', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(504, { error: 'gateway timeout' }),
      );

      const service = new AiService(makeConfigService());

      try {
        await service.summarize(dto);
        fail('expected summarize to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(GatewayTimeoutException);
        expect((error as GatewayTimeoutException).message).toBe(
          'AI summarisation timed out. Try again.',
        );
      }
    });

    it('maps an ok:true response with empty choices to 502', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(200, { choices: [] }));

      const service = new AiService(makeConfigService());

      await expect(service.summarize(dto)).rejects.toThrow(BadGatewayException);
    });

    it('maps an ok:true response with whitespace-only content to 502', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: '   ' } }] }),
      );

      const service = new AiService(makeConfigService());

      await expect(service.summarize(dto)).rejects.toThrow(BadGatewayException);
    });

    it('throws 503 ServiceUnavailableException and never calls fetch when OPENROUTER_API_KEY is missing', async () => {
      const service = new AiService(
        makeConfigService({ OPENROUTER_API_KEY: undefined }),
      );

      await expect(service.summarize(dto)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never leaks the API key or raw upstream JSON in any thrown error message', async () => {
      const scenarios: Array<() => void> = [
        () =>
          fetchSpy.mockResolvedValue(jsonResponse(500, { key: FAKE_API_KEY })),
        () =>
          fetchSpy.mockResolvedValue(jsonResponse(429, { key: FAKE_API_KEY })),
        () => fetchSpy.mockResolvedValue(jsonResponse(200, { choices: [] })),
      ];

      for (const setup of scenarios) {
        setup();
        const service = new AiService(makeConfigService());
        try {
          await service.summarize(dto);
          fail('expected summarize to throw');
        } catch (error) {
          const message = (error as Error).message;
          expect(message).not.toContain(FAKE_API_KEY);
          expect(message).not.toContain('OPENROUTER_API_KEY value');
          expect(message).not.toContain('{');
        }
      }
    });
  });
});
