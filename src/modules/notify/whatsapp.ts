/**
 * WhatsApp delivery, behind a driver interface (same shape as sms.ts).
 *
 * A business can only START a WhatsApp conversation with a pre-approved
 * TEMPLATE message, so the interface sends a template with positional body
 * parameters rather than free text.
 */
import { env } from '../core/env';

export type TemplateMessage = {
  /** Digits only, with country code and no "+", e.g. 919876543211. */
  to: string;
  template: string;
  language: string;
  bodyParams: string[];
};

export interface WhatsAppDriver {
  readonly name: string;
  send(message: TemplateMessage): Promise<{ messageId: string | null }>;
}

export class WhatsAppError extends Error {
  override readonly name = 'WhatsAppError';
  constructor(
    message: string,
    /** True when trying again later might work (outage, rate limit); false for bad number / template problems. */
    readonly retryable: boolean,
    readonly status: number | null = null,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

const consoleDriver: WhatsAppDriver = {
  name: 'console',
  async send(message) {
    process.stdout.write(
      `[whatsapp:${message.to}] template=${message.template}/${message.language} params=${JSON.stringify(message.bodyParams)}\n`,
    );
    return { messageId: null };
  },
};

const metaDriver: WhatsAppDriver = {
  name: 'meta',
  async send(message) {
    const e = env();
    if (!e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_ACCESS_TOKEN) {
      throw new WhatsAppError('WhatsApp credentials are not configured', false);
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${e.WHATSAPP_API_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: message.to,
            type: 'template',
            template: {
              name: message.template,
              language: { code: message.language },
              components: [{ type: 'body', parameters: message.bodyParams.map((text) => ({ type: 'text', text })) }],
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (error) {
      throw new WhatsAppError(`WhatsApp request failed: ${String(error)}`, true);
    }

    const body = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      const code = body.error?.code ?? null;
      // Rate limits and server errors may clear; a bad number, an unapproved
      // template or an expired token will not fix themselves on a retry.
      const retryable = response.status === 429 || response.status >= 500;
      throw new WhatsAppError(
        `WhatsApp API ${response.status}${code ? ` (code ${code})` : ''}: ${(body.error?.message ?? 'no detail').slice(0, 300)}`,
        retryable,
        response.status,
        code,
      );
    }
    return { messageId: body.messages?.[0]?.id ?? null };
  },
};

const drivers: Record<string, WhatsAppDriver> = { console: consoleDriver, meta: metaDriver };

export function whatsAppDriver(): WhatsAppDriver {
  return drivers[env().WHATSAPP_DRIVER] ?? consoleDriver;
}
