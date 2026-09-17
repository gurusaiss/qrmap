'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import { passwordLoginAction, sendOtpAction, verifyOtpAction, type ActionState } from './actions';

const initial: ActionState = {};

/**
 * Phone + OTP is the primary route: in this market phone is the real identity
 * and email is a weak identifier. Email + password is kept for platform staff.
 */
export function LoginForm() {
  const [mode, setMode] = useState<'phone' | 'password'>('phone');
  const [otpState, sendOtp] = useActionState(sendOtpAction, initial);
  const [verifyState, verify] = useActionState(verifyOtpAction, initial);
  const [passwordState, login] = useActionState(passwordLoginAction, initial);

  const awaitingCode = otpState.sent || verifyState.sent;
  const phone = verifyState.phone ?? otpState.phone ?? '';

  if (mode === 'password') {
    return (
      <div className="mt-6 space-y-4">
        <form action={login} className="space-y-4">
          <ErrorText>{passwordState.error}</ErrorText>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        <Button variant="ghost" className="w-full" onClick={() => setMode('phone')}>
          Sign in with mobile number instead
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {!awaitingCode ? (
        <form action={sendOtp} className="space-y-4">
          <ErrorText>{otpState.error}</ErrorText>
          <Field label="Mobile number" hint="We'll send a 6-digit code by SMS.">
            <Input
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
              required
            />
          </Field>
          <Button type="submit" className="w-full">
            Send code
          </Button>
        </form>
      ) : (
        <form action={verify} className="space-y-4">
          <ErrorText>{verifyState.error}</ErrorText>
          <input type="hidden" name="phone" value={phone} />
          <Field label="Enter the 6-digit code" hint={`Sent to ${phone}`}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </Field>
          <Button type="submit" className="w-full">
            Verify and sign in
          </Button>
        </form>
      )}

      <Button variant="ghost" className="w-full" onClick={() => setMode('password')}>
        Sign in with email instead
      </Button>
    </div>
  );
}
