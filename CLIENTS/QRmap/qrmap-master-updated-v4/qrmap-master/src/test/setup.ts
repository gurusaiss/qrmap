/** Vitest global setup: load .env so DB-backed tests can connect. */
import { readFileSync, existsSync } from 'node:fs';

const file = process.env.ENV_FILE ?? '.env';
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || !m[1]) continue;
    const key = m[1];
    if (process.env[key] === undefined) process.env[key] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}
(process.env as Record<string, string>)['NODE_ENV'] = 'test';
