'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import {
  completeTotpLoginAction,
  passwordLoginAction,
  sendOtpAction,
  verifyOtpAction,
  type ActionState,
} from './actions';

const initial: ActionState = {};

/**
 * Phone + OTP is the primary route: in this market phone is the real identity
 * and email is a weak identifier. Email + password is kept for platform
 * staff, who additionally carry mandatory TOTP 2FA (docs/03 §C4) — enforced
 * here as an unavoidable second step, never a skippable one.
 */
export function LoginForm() {
  const [mode, setMode] = useState<'phone' | 'password'>('phone');
  const [otpState, sendOtp] = useActionState(sendOtpAction, initial);
  const [verifyState, verify] = useActionState(verifyOtpAction, initial);
  const [passwordState, login] = useActionState(passwordLoginAction, initial);
  const [totpState, verifyTotpCode] = useActionState(completeTotpLoginAction, initial);

  const awaitingCode = otpState.sent || verifyState.sent;
  const phone = verifyState.phone ?? otpState.phone ?? '';

  // Once the server has told us to enrol or verify TOTP, that step owns the
  // screen until it resolves — there is no way back to typing the password
  // again without literally reloading, which is the point of a mandatory step.
  const totpStep = totpState.totpStep ?? passwordState.totpStep;
  const totpUserId = totpState.totpUserId ?? passwordState.totpUserId;

  if (totpStep && totpUserId) {
    return (
      <TotpStep
        step={totpStep}
        userId={totpUserId}
        secret={passwordState.totpSecret}
        otpauthUri={passwordState.totpOtpauthUri}
        action={verifyTotpCode}
        error={totpState.error}
      />
    );
  }

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

function TotpStep({
  step,
  userId,
  secret,
  otpauthUri,
  action,
  error,
}: {
  step: 'setup' | 'required';
  userId: string;
  secret?: string;
  otpauthUri?: string;
  action: (payload: FormData) => void;
  error?: string;
}) {
  return (
    <div className="mt-6 space-y-4">
      {step === 'setup' && (
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">Set up two-factor authentication</h2>
          <p className="text-[14px] text-ink-500">
            Platform accounts require an authenticator app (Google Authenticator, Authy, 1Password).
            Add this account using the code below, then enter the 6-digit number it shows.
          </p>
          {otpauthUri && (
            <img
              alt="Scan this QR code in your authenticator app"
              width={200}
              height={200}
              className="mx-auto rounded-lg border border-ink-200"
              src={`/api/totp-qr?uri=${encodeURIComponent(otpauthUri)}`}
            />
          )}
          {secret && (
            <p className="text-center font-mono text-[13px] text-ink-500">
              Manual entry key: {secret}
            </p>
          )}
        </div>
      )}

      <form action={action} className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="wasSetup" value={step === 'setup' ? '1' : '0'} />
        <Field label="Authenticator code">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus />
        </Field>
        <Button type="submit" className="w-full">
          Verify
        </Button>
      </form>
    </div>
  );
}
