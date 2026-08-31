'use client';

import { use, useState } from 'react';
import { Check, Mail, ShieldCheck, X } from 'lucide-react';

import type { InvitationPreview } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { Stagger } from '@/components/motion/stagger';
import { IconWrapper } from '@/components/workspace/icon-wrapper';

type PageProps = { params: Promise<{ token: string }> };

const MOCK_INVITATION: InvitationPreview = {
  workspaceName: 'Harbor Labs',
  workspaceIcon: 'anchor',
  role: 'MEMBER',
  email: 'alex@harbor.test',
  expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  status: 'PENDING',
};

export default function InviteTokenPage({ params }: PageProps) {
  const { token } = use(params);

  const invitation: InvitationPreview = MOCK_INVITATION;

  const [acceptState, setAcceptState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [declineState, setDeclineState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');

  const handleAccept = () => {
    setAcceptState('loading');
    console.log('[invite] accept clicked', { token, invitation });
    setTimeout(() => {
      console.log('[invite] accept mock success', { token });
      setAcceptState('success');
    }, 900);
  };

  const handleDecline = () => {
    setDeclineState('loading');
    console.log('[invite] decline clicked', { token, invitation });
    setTimeout(() => {
      console.log('[invite] decline mock success', { token });
      setDeclineState('success');
    }, 900);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-bg px-4 py-10">
      <Stagger className="flex w-full max-w-[580px] flex-col items-center gap-4">
        <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted">
          INVITATION
        </p>

        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full flex-col items-center gap-2.5">
            <span
              aria-hidden
              className="inline-grid size-12 place-items-center rounded-xl border border-ds-brand/40 bg-ds-brand-soft"
            >
              <IconWrapper
                icon={invitation.workspaceIcon}
                size="md"
                variant="soft"
                className="border-0 bg-transparent"
              />
            </span>
            <h1 className="text-balance text-center text-[34px] font-bold leading-[1.12] tracking-[-1.1px] text-ds-text">
              Join {invitation.workspaceName}
            </h1>
            <p className="text-balance w-full text-center text-[13px] font-normal text-ds-text-muted">
              You&apos;ve been invited to join this workspace. You&apos;ll gain
              access after you accept.
            </p>
          </div>

          <div className="flex w-[520px] max-w-full items-center gap-2.5 border-b border-ds-border px-0 py-3">
            <Mail
              className="size-[14px] shrink-0 text-ds-text-muted"
              aria-hidden
            />
            <span className="flex grow items-center gap-1.5">
              <span className="text-[10px] font-medium text-ds-text-muted">
                Invited as ·&nbsp;
              </span>
              <span className="text-[12px] font-semibold text-ds-text">
                {invitation.email}
              </span>
            </span>
            <span className="inline-flex h-[22px] items-center justify-center rounded-full border border-transparent px-2.5 font-mono text-[10px] font-semibold tracking-[0.4px] text-ds-text-muted">
              {invitation.role}
            </span>
          </div>

          <p className="w-full text-center text-[12px] font-normal leading-[1.5] text-ds-text-muted">
            Pending invitations don&apos;t grant access until accepted.
          </p>

          <div className="flex w-[520px] max-w-full flex-col gap-3">
            <StatefulButton
              type="button"
              size="md"
              className="h-9 w-full rounded-md bg-ds-brand text-sm font-semibold text-white hover:bg-ds-brand/90"
              icon={<Check className="h-4 w-4" />}
              state={acceptState}
              loadingText="Accepting…"
              successText="Accepted"
              errorText="Try again"
              onClick={handleAccept}
              disabled={acceptState !== 'idle' || declineState === 'loading'}
            >
              Accept invitation
            </StatefulButton>

            <StatefulButton
              type="button"
              variant="ghost"
              size="md"
              className="h-9 w-full rounded-md text-sm font-medium"
              icon={<X className="h-4 w-4" />}
              state={declineState}
              loadingText="Declining…"
              successText="Declined"
              errorText="Try again"
              onClick={handleDecline}
              disabled={declineState !== 'idle' || acceptState === 'loading'}
            >
              Decline
            </StatefulButton>
          </div>
        </div>

        <div className="flex w-full items-center justify-center gap-1.5">
          <ShieldCheck
            className="size-3 shrink-0 text-ds-text-muted"
            aria-hidden
          />
          <p className="text-center text-[11px] font-normal text-ds-text-muted">
            Verified email required to accept. If you don&apos;t have an
            account, you&apos;ll create one first.
          </p>
        </div>
      </Stagger>
    </div>
  );
}
