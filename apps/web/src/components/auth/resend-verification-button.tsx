'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';

import { StatefulButton } from '@/components/motion/button/stateful';

interface ResendVerificationButtonProps {
  /** Button label while idle. */
  label?: string;
  /** Confirmation message shown after a successful send. */
  sentMessage?: string;
  /**
   * Real send action. When omitted the button falls back to a stubbed
   * delay so screens remain demoable before integration.
   */
  onResend?: () => Promise<unknown>;
}

/** How long the "sent" confirmation shows before reverting to the button. */
const SENT_MESSAGE_MS = 4000;

/**
 * Idempotent resend action for email-confirmation screens: idle → sending
 * → sent, then automatically back to idle after a few seconds (the user
 * may not have received the first email, so the action must stay
 * repeatable).
 */
export function ResendVerificationButton({
  label = 'Resend verification email',
  sentMessage = 'Verification email sent — check your inbox',
  onResend,
}: ResendVerificationButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'sent') return;
    const timer = setTimeout(() => setStatus('idle'), SENT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const onResendClick = async () => {
    setStatus('sending');
    setError(null);
    try {
      if (onResend) {
        await onResend();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      setError('Could not send the email. Please try again.');
    }
  };

  if (status === 'sent') {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-ds-success">
        <Mail className="size-4" />
        {sentMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <StatefulButton
        type="button"
        variant="outline"
        onClick={() => void onResendClick()}
        state={status === 'sending' ? 'loading' : 'idle'}
        loadingText="Sending…"
        disabled={status === 'sending'}
      >
        {label}
      </StatefulButton>
      {error !== null && (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
