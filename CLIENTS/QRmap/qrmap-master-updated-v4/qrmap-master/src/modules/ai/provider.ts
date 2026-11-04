/**
 * AI provider abstraction.
 *
 * Mandatory rather than tidy: every free tier is rate-limited ORG-WIDE, not
 * per tenant (Gemini ~1,500 req/day and 15 RPM; Groq ~14,400 req/day). At 300
 * merchants that is roughly five questions per merchant per day, so no provider
 * can be treated as a permanent foundation and we must be able to switch.
 *
 * Nothing above this layer knows which vendor is in use.
 */
import { env } from '../core/env';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type CompletionRequest = {
  system: string;
  messages: Message[];
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
};

export type CompletionResult = {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
};

export interface AiProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class AiUnavailableError extends Error {
  override readonly name = 'AiUnavailableError';
}

/** Used when AI is switched off. Callers fall back to deterministic answers. */
const noneProvider: AiProvider = {
  name: 'none',
  async complete() {
    throw new AiUnavailableError('No AI provider is configured.');
  },
};

/** Deterministic provider for tests: no network, no keys, predictable output. */
export const mockProvider: AiProvider = {
  name: 'mock',
  async complete(request) {
    const question = request.messages.at(-1)?.content ?? '';
    const context = request.system;
    // Mimics a grounded model: answers only from the supplied context.
    const text = context.includes(question.slice(0, 12))
      ? `Based on the shop's information: ${question}`
      : "I don't have that information. Please contact the shop directly.";
    return { text, tokensIn: context.length / 4, tokensOut: text.length / 4, model: 'mock-1' };
  },
};

const geminiProvider = (): AiProvider => ({
  name: 'gemini',
  async complete(request) {
    const e = env();
    const model = e.AI_MODEL ?? 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': e.AI_API_KEY ?? '' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: request.maxTokens,
            temperature: request.temperature,
          },
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    if (!response.ok) throw new AiUnavailableError(`Gemini returned ${response.status}`);
    const json = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
      model,
    };
  },
});

const groqProvider = (): AiProvider => ({
  name: 'groq',
  async complete(request) {
    const e = env();
    const model = e.AI_MODEL ?? 'llama-3.3-70b-versatile';
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.AI_API_KEY ?? ''}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok) throw new AiUnavailableError(`Groq returned ${response.status}`);
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      model,
    };
  },
});

const cloudflareProvider = (): AiProvider => ({
  name: 'cloudflare',
  async complete(request) {
    const e = env();
    const model = e.AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct';
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID ?? ''}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.AI_API_KEY ?? ''}` },
        body: JSON.stringify({
          messages: [{ role: 'system', content: request.system }, ...request.messages],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    if (!response.ok) throw new AiUnavailableError(`Cloudflare Workers AI returned ${response.status}`);
    const json = (await response.json()) as { result?: { response?: string } };
    return { text: json.result?.response ?? '', tokensIn: 0, tokensOut: 0, model };
  },
});

const registry: Record<string, () => AiProvider> = {
  none: () => noneProvider,
  mock: () => mockProvider,
  gemini: geminiProvider,
  groq: groqProvider,
  cloudflare: cloudflareProvider,
};

let override: AiProvider | null = null;

/** Test seam. */
export function setProviderOverride(provider: AiProvider | null): void {
  override = provider;
}

export function aiProvider(): AiProvider {
  if (override) return override;
  return (registry[env().AI_PROVIDER] ?? registry.none!)();
}

/**
 * Ordered fallback chain: the configured provider first, then any other
 * provider that actually has credentials configured.
 *
 * Free tiers are rate-limited ORG-WIDE (Groq ~14,400 req/day; Gemini ~1,500),
 * so the realistic failure here is not "the vendor is down", it is "we hit the
 * daily cap at 4pm". Falling through to a second free provider keeps the
 * assistant answering instead of going dark for the rest of the day.
 *
 * If every provider fails, the caller degrades to the deterministic answer
 * path, which needs no provider at all — so a missing or exhausted API key is
 * never a hard outage, just a narrower set of answerable questions.
 */
export function aiProviderChain(): AiProvider[] {
  if (override) return [override];

  const e = env();
  const chain: AiProvider[] = [];
  const seen = new Set<string>();

  const add = (name: string): void => {
    if (seen.has(name) || name === 'none') return;
    const factory = registry[name];
    if (!factory) return;
    // Only include providers whose credentials are actually present, so a
    // fallback attempt cannot waste a round trip on a guaranteed 401.
    if (!hasCredentials(name)) return;
    seen.add(name);
    chain.push(factory());
  };

  add(e.AI_PROVIDER);
  // Free-tier providers, in preference order, as automatic backstops.
  for (const candidate of ['groq', 'cloudflare', 'gemini']) add(candidate);

  return chain;
}

/** Whether a provider has everything it needs to be worth calling. */
export function hasCredentials(name: string): boolean {
  const e = env();
  switch (name) {
    case 'mock':
      return true;
    case 'groq':
    case 'gemini':
      return Boolean(e.AI_API_KEY);
    case 'cloudflare':
      return Boolean(e.AI_API_KEY && e.CLOUDFLARE_ACCOUNT_ID);
    default:
      return false;
  }
}

export function aiEnabled(): boolean {
  return env().AI_PROVIDER !== 'none' || override !== null;
}
