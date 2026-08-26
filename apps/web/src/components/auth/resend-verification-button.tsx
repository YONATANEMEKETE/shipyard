'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ResendVerificationButtonProps {
  /** Button label while idle. */
  label?: string;
  /** Confirmation message shown after the stub send completes. */
  sentMessage?: string;
}

/**
 * Stub resend action for the verify-email screen. Shows a brief loading
 * state and a confirmation; the actual API call lands with integration.
 */
export function ResendVerificationButton({
  label = 'Resend verification email',
  sentMessage = 'Verification email sent — check your inbox',
}: ResendVerificationButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const onResend = async () => {
    // TODO: POST to the send-verification-email endpoint once integration
    // lands; surface envelope errors here.
    setStatus('sending');
    await new Promise((resolve) => setTimeout(resolve, 600));
    setStatus('sent');
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
    <Button
      type="button"
      variant="outline"
      onClick={() => void onResend()}
      disabled={status === 'sending'}
    >
      {status === 'sending' ? (
        <>
          <Loader2 className="animate-spin" />
          Sending…
        </>
      ) : (
        label
      )}
    </Button>
  );
}
