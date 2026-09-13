import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_REASON_MAX,
  BlockedControl,
} from '@/components/issues/blocked-control';

/**
 * BlockedControl owns the write path for the orthogonal blocked flag
 * (spec §3.3): popover-first so a single PATCH carries the optional reason,
 * and read-only for Done / archived issues. The parent owns the mutation, so
 * every assertion here is about which callback fired with what — no API layer.
 */
function setup(
  props: Partial<React.ComponentProps<typeof BlockedControl>> = {},
) {
  const onSet = vi.fn();
  const onEditReason = vi.fn();
  const onClear = vi.fn();
  render(
    <BlockedControl
      blocked={false}
      blockedReason={null}
      status="TODO"
      onSet={onSet}
      onEditReason={onEditReason}
      onClear={onClear}
      {...props}
    />,
  );
  return { onSet, onEditReason, onClear };
}

const openPopover = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('blocked-control-trigger'));
  return screen.findByTestId('blocked-control-popover');
};

describe('BlockedControl — resting states', () => {
  it('reads "No" when the issue is not blocked', () => {
    setup();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.queryByTestId('blocked-reason')).not.toBeInTheDocument();
  });

  it('reads "Yes" and surfaces the reason when blocked', () => {
    setup({ blocked: true, blockedReason: 'Waiting on IdP fix' });
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-reason')).toHaveTextContent(
      'Waiting on IdP fix',
    );
  });

  it('hides the reason line when blocked without one', () => {
    setup({ blocked: true, blockedReason: null });
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.queryByTestId('blocked-reason')).not.toBeInTheDocument();
  });
});

describe('BlockedControl — blocking', () => {
  it('sends the typed reason on Mark blocked', async () => {
    const user = userEvent.setup();
    const { onSet } = setup();
    await openPopover(user);

    await user.type(
      screen.getByTestId('blocked-reason-input'),
      'Waiting on IdP fix',
    );
    await user.click(screen.getByTestId('blocked-control-submit'));

    expect(onSet).toHaveBeenCalledExactlyOnceWith('Waiting on IdP fix');
  });

  it('allows blocking with no reason (reason is optional)', async () => {
    const user = userEvent.setup();
    const { onSet } = setup();
    await openPopover(user);

    await user.click(screen.getByTestId('blocked-control-submit'));

    expect(onSet).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('trims whitespace-only input down to null', async () => {
    const user = userEvent.setup();
    const { onSet } = setup();
    await openPopover(user);

    await user.type(screen.getByTestId('blocked-reason-input'), '   ');
    await user.click(screen.getByTestId('blocked-control-submit'));

    expect(onSet).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('submits on Enter without a second click', async () => {
    const user = userEvent.setup();
    const { onSet } = setup();
    await openPopover(user);

    await user.type(
      screen.getByTestId('blocked-reason-input'),
      'Blocked on infra{Enter}',
    );

    expect(onSet).toHaveBeenCalledExactlyOnceWith('Blocked on infra');
  });

  it('does not block when the popover is dismissed', async () => {
    const user = userEvent.setup();
    const { onSet } = setup();
    await openPopover(user);

    await user.keyboard('{Escape}');

    expect(onSet).not.toHaveBeenCalled();
  });

  it('shows the character counter once the draft gets long', async () => {
    const user = userEvent.setup();
    setup();
    await openPopover(user);

    await user.click(screen.getByTestId('blocked-reason-input'));
    await user.paste('x'.repeat(400));

    expect(screen.getByText(`400/${BLOCKED_REASON_MAX}`)).toBeInTheDocument();
  });
});

describe('BlockedControl — editing the reason while blocked', () => {
  it('disables Save reason until the draft actually changes', async () => {
    const user = userEvent.setup();
    const { onEditReason } = setup({ blocked: true, blockedReason: 'Old why' });
    await openPopover(user);

    const submit = screen.getByTestId('blocked-control-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('blocked-reason-input'), ' now');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onEditReason).toHaveBeenCalledExactlyOnceWith('Old why now');
  });

  it('clears the reason when the draft is emptied', async () => {
    const user = userEvent.setup();
    const { onEditReason } = setup({ blocked: true, blockedReason: 'Old why' });
    await openPopover(user);

    await user.clear(screen.getByTestId('blocked-reason-input'));
    await user.click(screen.getByTestId('blocked-control-submit'));

    expect(onEditReason).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('swaps the unblock label for a bare loader while the write is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (ok: boolean) => void;
    const onClear = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    render(
      <BlockedControl
        blocked
        blockedReason="Waiting on IdP fix"
        status="TODO"
        onSet={vi.fn()}
        onEditReason={vi.fn()}
        onClear={onClear}
      />,
    );
    await openPopover(user);

    const unblock = screen.getByTestId('blocked-control-unblock');
    expect(within(unblock).getByText('Unblock')).toBeInTheDocument();

    await user.click(unblock);

    // Loader only — the visible label is gone and the button reports busy. The
    // spinner carries an sr-only "Unblocking issue" for screen readers, so
    // assert on the visible label rather than on textContent.
    expect(within(unblock).queryByText('Unblock')).toBeNull();
    expect(
      screen.getByRole('status', { name: 'Unblocking issue' }),
    ).toBeInTheDocument();
    expect(unblock).toHaveAttribute('aria-busy', 'true');

    resolve(true);
    // Success closes the popover, so there is no third beat to show.
    await waitFor(() =>
      expect(screen.queryByTestId('blocked-control-popover')).toBeNull(),
    );
  });

  it('locks the sibling actions while a write is in flight', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn(() => new Promise<boolean>(() => {}));
    render(
      <BlockedControl
        blocked
        blockedReason="Waiting on IdP fix"
        status="TODO"
        onSet={vi.fn()}
        onEditReason={vi.fn()}
        onClear={onClear}
      />,
    );
    await openPopover(user);
    await user.click(screen.getByTestId('blocked-control-unblock'));

    // Both actions PATCH the same issue — no concurrent writes.
    expect(screen.getByTestId('blocked-control-submit')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('unblocks without a confirmation step', async () => {
    const user = userEvent.setup();
    const { onClear, onEditReason } = setup({
      blocked: true,
      blockedReason: 'Old why',
    });
    await openPopover(user);

    await user.click(screen.getByTestId('blocked-control-unblock'));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onEditReason).not.toHaveBeenCalled();
  });

  it('discards an edited draft that was never submitted', async () => {
    const user = userEvent.setup();
    const { onEditReason } = setup({ blocked: true, blockedReason: 'Old why' });
    await openPopover(user);

    await user.type(screen.getByTestId('blocked-reason-input'), ' discarded');
    await user.keyboard('{Escape}');
    await openPopover(user);

    expect(screen.getByTestId('blocked-reason-input')).toHaveValue('Old why');
    expect(onEditReason).not.toHaveBeenCalled();
  });
});

describe('BlockedControl — stateful submit', () => {
  it('shows the success beat and closes once the write resolves', async () => {
    const user = userEvent.setup();
    let resolve!: (ok: boolean) => void;
    const onSet = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    render(
      <BlockedControl
        blocked={false}
        blockedReason={null}
        status="TODO"
        onSet={onSet}
        onEditReason={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await openPopover(user);
    await user.click(screen.getByTestId('blocked-control-submit'));

    // In flight — the label rolls to the loading copy.
    expect(await screen.findByText('Blocking')).toBeInTheDocument();

    resolve(true);
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });

  it('stays open with the draft intact when the write fails', async () => {
    const user = userEvent.setup();
    const onSet = vi.fn(() => Promise.resolve(false));
    render(
      <BlockedControl
        blocked={false}
        blockedReason={null}
        status="TODO"
        onSet={onSet}
        onEditReason={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await openPopover(user);
    await user.type(screen.getByTestId('blocked-reason-input'), 'Flaky net');
    await user.click(screen.getByTestId('blocked-control-submit'));

    expect(await screen.findByText('Try again')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-reason-input')).toHaveValue('Flaky net');
  });
});

describe('BlockedControl — read-only states', () => {
  it('disables the control on a Done issue and offers the reopen hint', () => {
    setup({ status: 'DONE' });
    expect(screen.getByTestId('blocked-control-disabled')).toBeInTheDocument();
    expect(
      screen.queryByTestId('blocked-control-trigger'),
    ).not.toBeInTheDocument();
  });

  it('renders a static value for an archived issue', () => {
    setup({
      archived: true,
      blocked: true,
      blockedReason: 'Frozen mid-flight',
    });
    expect(
      screen.queryByTestId('blocked-control-trigger'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('blocked-control-disabled'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-reason')).toHaveTextContent(
      'Frozen mid-flight',
    );
  });

  it('disables the trigger while a write is in flight', () => {
    setup({ pending: true });
    expect(screen.getByTestId('blocked-control-trigger')).toBeDisabled();
  });
});
