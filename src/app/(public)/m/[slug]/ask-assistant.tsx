'use client';

import { useState } from 'react';

/**
 * Optional enhancement. The page is complete without it; if JavaScript does not
 * run, the customer still has every price, offer and contact route.
 */
export function AskAssistant({ slug, businessName }: { slug: string; businessName: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!question.trim()) return;
    setState('loading');
    setAnswer(null);
    try {
      const response = await fetch(`/api/ai/${encodeURIComponent(slug)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const json = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok) {
        setAnswer(json.error ?? 'Sorry, that did not work. Please try again.');
        setState('error');
        return;
      }
      setAnswer(json.answer ?? '');
      setState('idle');
    } catch {
      setAnswer('Could not reach the assistant. Please check your connection.');
      setState('error');
    }
  }

  return (
    <section className="mt-6 px-4">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Ask a question</h2>
      <form onSubmit={submit} className="card p-3">
        <label htmlFor="ask" className="sr-only">
          Ask {businessName} a question
        </label>
        <input
          id="ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder="What time do you open?"
          className="tap-target w-full rounded-lg border border-ink-200 px-3 text-[15px]"
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="tap-target mt-2 w-full rounded-lg bg-ink-900 px-4 font-semibold text-white disabled:opacity-60"
        >
          {state === 'loading' ? 'Asking…' : 'Ask'}
        </button>
        {answer !== null && (
          <p role="status" className="mt-3 rounded-lg bg-ink-50 p-3 text-[15px] leading-relaxed">
            {answer}
          </p>
        )}
        <p className="mt-2 text-[12px] text-ink-400">
          Answers come only from this shop&apos;s own information. Please call to confirm anything important.
        </p>
      </form>
    </section>
  );
}
