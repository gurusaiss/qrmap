import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  current: {
    WHATSAPP_DRIVER: 'meta',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_ACCESS_TOKEN: 'secret-token',
    WHATSAPP_API_VERSION: 'v21.0',
  } as Record<string, string | undefined>,
}));
vi.mock('../../core/env', () => ({ env: () => envMock.current }));

import { WhatsAppError, whatsAppDriver } from '../whatsapp';

const message = { to: '919876543211', template: 'monthly_report', language: 'en', bodyParams: ['Shop', 'May 2026', '10'] };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  envMock.current = {
    WHATSAPP_DRIVER: 'meta',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_ACCESS_TOKEN: 'secret-token',
    WHATSAPP_API_VERSION: 'v21.0',
  };
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

describe('meta driver', () => {
  it('posts a template message to the Cloud API and returns the message id', async () => {
    reply(200, { messages: [{ id: 'wamid.ABC' }] });
    const result = await whatsAppDriver().send(message);

    expect(result).toEqual({ messageId: 'wamid.ABC' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543211',
      type: 'template',
      template: {
        name: 'monthly_report',
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Shop' }, { type: 'text', text: 'May 2026' }, { type: 'text', text: '10' }] },
        ],
      },
    });
  });

  it('refuses to send, without calling the network, when credentials are missing', async () => {
    envMock.current = { WHATSAPP_DRIVER: 'meta' };
    await expect(whatsAppDriver().send(message)).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, 131026, 'Message undeliverable', false],
    [401, 190, 'Invalid OAuth access token', false],
    [404, 132001, 'Template does not exist', false],
    [429, 130429, 'Rate limit hit', true],
    [500, 1, 'Unexpected error', true],
    [503, 2, 'Service unavailable', true],
  ])('classifies HTTP %i (code %i) as retryable=%s', async (status, code, text, retryable) => {
    reply(status, { error: { message: text, code } });
    const error = await whatsAppDriver().send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppError);
    expect(error).toMatchObject({ retryable, status, code });
    expect((error as Error).message).toContain(text);
  });

  it('treats a network failure as retryable and never leaks the token in the error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    const error = (await whatsAppDriver().send(message).catch((e: unknown) => e)) as WhatsAppError;
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain('secret-token');
  });

  it('survives an error response that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(whatsAppDriver().send(message)).rejects.toMatchObject({ retryable: true, status: 502 });
  });
});

describe('driver selection', () => {
  it('defaults to the console driver, which sends nothing over the network', async () => {
    envMock.current = { WHATSAPP_DRIVER: 'console' };
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const driver = whatsAppDriver();
    expect(driver.name).toBe('console');
    await expect(driver.send(message)).resolves.toEqual({ messageId: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(String(write.mock.calls[0]?.[0])).toContain('919876543211');
    write.mockRestore();
  });
});
