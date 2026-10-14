'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import {
  completePinLoginAction,
  passwordLoginAction,
  phonePinLoginAction,
  sendOtpAction,
  verifyOtpAction,
  type ActionState,
} from './actions';

const initial: ActionState = {};

/**
 * Two real ways in, both visible: email+password (platform staff, who carry
 * a mandatory 6-digit PIN as a second step, and any merchant who prefers
 * email) and phone+PIN (a merchant's single-factor login - no SMS, no
 * second step, set by the admin at creation and changeable afterward).
 * Phone+OTP (sendOtpAction/verifyOtpAction) still exists below and still
 * works, but no button sets mode to 'phone_otp' — no SMS provider is
 * configured yet (MANUAL-SETUP.md §9), so offering it would let someone try
 * a code that can never arrive. Wire a button to it once SMS is set up.
 */
export function LoginForm() {
  const [mode, setMode] = useState<'email' | 'phone_pin' | 'phone_otp'>('email');
  const [otpState, sendOtp] = useActionState(sendOtpAction, initial);
  const [verifyState, verify] = useActionState(verifyOtpAction, initial);
  const [passwordState, login] = useActionState(passwordLoginAction, initial);
  const [phonePinState, phonePinLogin] = useActionState(phonePinLoginAction, initial);
  const [pinState, verifyPin] = useActionState(completePinLoginAction, initial);

  const awaitingCode = otpState.sent || verifyState.sent;
  const otpPhone = verifyState.phone ?? otpState.phone ?? '';

  // Once the server has told us to set up or verify the PIN, that step owns
  // the screen until it resolves — there is no way back to typing the
  // password again without literally reloading, which is the point of a
  // mandatory step.
  const pinStep = pinState.pinStep ?? passwordState.pinStep;
  const pinUserId = pinState.pinUserId ?? passwordState.pinUserId;

  if (pinStep && pinUserId) {
    return <PinStep step={pinStep} userId={pinUserId} action={verifyPin} error={pinState.error} />;
  }

  if (mode === 'email') {
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
        <Button variant="ghost" className="w-full" onClick={() => setMode('phone_pin')}>
          Sign in with mobile number instead
        </Button>
      </div>
    );
  }

  if (mode === 'phone_pin') {
    return (
      <div className="mt-6 space-y-4">
        <form action={phonePinLogin} className="space-y-4">
          <ErrorText>{phonePinState.error}</ErrorText>
          <Field label="Mobile number">
            <Input
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
              defaultValue={phonePinState.phone}
              required
            />
          </Field>
          <Field label="PIN" hint="The 6-digit PIN given to you when your account was set up">
            <Input name="pin" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required />
          </Field>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        <Button variant="ghost" className="w-full" onClick={() => setMode('email')}>
          Sign in with email instead
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
          <input type="hidden" name="phone" value={otpPhone} />
          <Field label="Enter the 6-digit code" hint={`Sent to ${otpPhone}`}>
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

      <Button variant="ghost" className="w-full" onClick={() => setMode('email')}>
        Sign in with email instead
      </Button>
    </div>
  );
}

function PinStep({
  step,
  userId,
  action,
  error,
}: {
  step: 'setup' | 'required';
  userId: string;
  action: (payload: FormData) => void;
  error?: string;
}) {
  return (
    <div className="mt-6 space-y-4">
      {step === 'setup' && (
        <div className="card space-y-2 p-4">
          <h2 className="font-semibold">Choose a 6-digit PIN</h2>
          <p className="text-[14px] text-ink-500">
            You&apos;ll enter this PIN, along with your password, every time you sign in to the admin
            console. Choose something you won&apos;t forget — there is no self-service reset yet.
          </p>
        </div>
      )}

      <form action={action} className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="wasSetup" value={step === 'setup' ? '1' : '0'} />
        <Field label={step === 'setup' ? 'New PIN' : 'PIN'}>
          <Input name="pin" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required autoFocus />
        </Field>
        {step === 'setup' && (
          <Field label="Confirm PIN">
            <Input
              name="confirmPin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </Field>
        )}
        <Button type="submit" className="w-full">
          {step === 'setup' ? 'Set PIN and sign in' : 'Verify'}
        </Button>
      </form>
    </div>
  );
}
