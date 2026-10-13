'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  completePinLogin,
  loginWithPassword,
  requestOtp,
  revokeSession,
  verifyOtp,
} from '@/modules/auth/service';
import { RateLimitError } from '@/modules/auth/rate-limit';
import { SESSION_COOKIE } from '@/modules/auth/service';
import { clearSessionCookie, setSessionCookie } from '@/modules/auth/session-server';
import { cookies } from 'next/headers';

export type ActionState = {
  error?: string;
  sent?: boolean;
  phone?: string;
  pinStep?: 'setup' | 'required';
  pinUserId?: string;
};

async function requestContext(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
    userAgent: h.get('user-agent') ?? '',
  };
}

function message(error: unknown): string {
  if (error instanceof RateLimitError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export async function sendOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const phone = String(formData.get('phone') ?? '');
  try {
    const { ip } = await requestContext();
    await requestOtp(phone, ip);
    return { sent: true, phone };
  } catch (error) {
    return { error: message(error), phone };
  }
}

export async function verifyOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const phone = String(formData.get('phone') ?? '');
  const code = String(formData.get('code') ?? '');
  try {
    const context = await requestContext();
    const { token } = await verifyOtp(phone, code, context);
    await setSessionCookie(token);
  } catch (error) {
    return { error: message(error), sent: true, phone };
  }
  redirect('/app');
}

export async function passwordLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  let result;
  try {
    const context = await requestContext();
    result = await loginWithPassword(email, password, context);
  } catch (error) {
    return { error: message(error) };
  }

  if (result.step === 'pin_setup') {
    return { pinStep: 'setup', pinUserId: result.userId };
  }
  if (result.step === 'pin_required') {
    return { pinStep: 'required', pinUserId: result.userId };
  }

  await setSessionCookie(result.token);
  redirect('/admin');
}

/** Second step for platform admins: choose a PIN (first login) or verify it (every login after). */
export async function completePinLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get('userId') ?? '');
  const pin = String(formData.get('pin') ?? '');
  const confirmPin = formData.get('confirmPin');
  const wasSetup = formData.get('wasSetup') === '1';

  if (wasSetup && confirmPin !== null && pin !== String(confirmPin)) {
    return { error: "PINs don't match.", pinStep: 'setup', pinUserId: userId };
  }

  try {
    const context = await requestContext();
    const { token } = await completePinLogin(userId, pin, context, wasSetup);
    await setSessionCookie(token);
  } catch (error) {
    return { error: message(error), pinStep: wasSetup ? 'setup' : 'required', pinUserId: userId };
  }
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  await clearSessionCookie();
  redirect('/login');
}
