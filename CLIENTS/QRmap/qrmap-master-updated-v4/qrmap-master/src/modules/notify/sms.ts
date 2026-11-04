/**
 * SMS delivery, behind a driver interface.
 *
 * OTP messages are the one genuine per-merchant variable cost (~Rs 0.14 each),
 * which is why the rate limits in auth/rate-limit.ts guard the spend as well as
 * the account.
 */
import { env } from '../core/env';

export interface SmsDriver {
  readonly name: string;
  send(to: string, message: string): Promise<void>;
}

/** Development driver: prints the message instead of spending money. */
const consoleDriver: SmsDriver = {
  name: 'console',
  async send(to, message) {
    process.stdout.write(`[sms:${to}] ${message}\n`);
  },
};

const msg91Driver: SmsDriver = {
  name: 'msg91',
  async send(to, message) {
    const e = env();
    if (!e.MSG91_AUTH_KEY || !e.MSG91_SENDER_ID) {
      throw new Error('MSG91 credentials are not configured');
    }
    const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: e.MSG91_AUTH_KEY },
      body: JSON.stringify({
        sender: e.MSG91_SENDER_ID,
        route: '4',
        country: '91',
        sms: [{ message, to: [to.replace(/^\+/, '')] }],
      }),
    });
    if (!response.ok) {
      throw new Error(`SMS delivery failed with status ${response.status}`);
    }
  },
};

const drivers: Record<string, SmsDriver> = {
  console: consoleDriver,
  msg91: msg91Driver,
};

export function smsDriver(): SmsDriver {
  return drivers[env().SMS_DRIVER] ?? consoleDriver;
}

export async function sendSms(to: string, message: string): Promise<void> {
  await smsDriver().send(to, message);
}
