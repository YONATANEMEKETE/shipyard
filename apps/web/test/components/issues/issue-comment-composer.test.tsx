import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IssueCommentComposer } from '@/components/issues/issue-comment-composer';

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'usr_1',
        name: 'Yonatane Mekete',
        email: 'yonatane@harbor.test',
        image: null,
      },
    },
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({
    data: {
      members: [
        {
          userId: 'usr_1',
          name: 'Yonatane Mekete',
          email: 'yonatane@harbor.test',
          image: null,
        },
        {
          userId: 'usr_2',
          name: 'Ana Ruiz',
          email: 'ana@harbor.test',
          image: null,
        },
        {
          userId: 'usr_3',
          name: 'Ana Beltran',
          email: 'ana.b@harbor.test',
          image: null,
        },
      ],
    },
  }),
}));

const field = () => screen.getByLabelText('Leave a comment');
const submit = () => screen.getByRole('button', { name: 'Comment' });

function renderComposer(props: Record<string, unknown> = {}) {
  return render(<IssueCommentComposer slug="acme" {...props} />);
}

describe('IssueCommentComposer — the field', () => {
  it('renders the viewer avatar, a growing textarea and the mention hint', () => {
    renderComposer();

    // A textarea, not a single-line input — comments are multi-line.
    expect(field().tagName).toBe('TEXTAREA');
    expect(field()).toHaveAttribute('placeholder', 'Leave a comment…');
    expect(field()).toHaveAttribute('rows', '1');
    expect(screen.getByText('YM')).toBeInTheDocument();
    expect(screen.getByText('Mention members with @')).toBeInTheDocument();
  });

  it('keeps Comment disabled until there is something to send', async () => {
    const user = userEvent.setup();
    renderComposer();

    expect(submit()).toBeDisabled();
    // Whitespace alone is not a comment.
    await user.type(field(), '   ');
    expect(submit()).toBeDisabled();

    await user.type(field(), 'Looks good.');
    expect(submit()).toBeEnabled();
  });

  it('submits the trimmed body once and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    await user.type(field(), '  Shipping the redirect fix.  ');
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      'Shipping the redirect fix.',
    );
    await waitFor(() => expect(field()).toHaveValue(''));
  });

  it('keeps the draft when the post fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('409 archived'));
    renderComposer({ onSubmit });

    await user.type(field(), 'Please keep me.');
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Nothing the author wrote is lost to a failed post.
    await waitFor(() => expect(field()).toHaveValue('Please keep me.'));
    expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled();
  });

  it('submits on Shift+Enter and leaves plain Enter to the newline', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    await user.type(field(), 'Line one');
    // Comments are multi-line, so plain Enter still breaks the line.
    await user.keyboard('{Enter}');
    expect(field()).toHaveValue('Line one\n');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(field(), 'Line two');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Line one\nLine two');
  });

  it('shows the pending beat while the post is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderComposer({ onSubmit });

    await user.type(field(), 'Slow one.');
    await user.click(submit());

    const busy = screen.getByRole('button', { name: /posting/i });
    expect(busy).toHaveAttribute('aria-busy', 'true');

    resolve();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Comment' }),
      ).toBeInTheDocument(),
    );
    expect(field()).toHaveValue('');
  });

  it('locks the composer on an archived issue', () => {
    renderComposer({ disabled: true });

    expect(field()).toBeDisabled();
    expect(field()).toHaveAttribute(
      'placeholder',
      'Archived issues are read-only',
    );
    expect(submit()).toBeDisabled();
  });
});

describe('IssueCommentComposer — mentions', () => {
  it('opens a member list on @ and filters as you type', async () => {
    const user = userEvent.setup();
    renderComposer();

    expect(screen.queryByRole('listbox')).toBeNull();

    await user.type(field(), 'hey @an');
    const list = screen.getByRole('listbox', { name: 'Mention a member' });
    expect(list).toBeInTheDocument();
    // Both Anas match; Yonatane does not.
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Ana Beltran')).toBeInTheDocument();
    expect(screen.queryByText('Yonatane Mekete')).toBeNull();

    await user.type(field(), 'a b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('inserts a disambiguated @handle when a suggestion is clicked', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(field(), 'hey @an');
    await user.click(screen.getByRole('option', { name: /Ana Ruiz/ }));

    // Both Anas share the first word, so the handle is the whole name slugged —
    // a single token that resolves to Ana Ruiz and nobody else (D6) — and the
    // query the reader typed is replaced, not left behind.
    expect(field()).toHaveValue('hey @ana-ruiz ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(submit()).toBeEnabled();
  });

  it('navigates with the arrow keys and inserts with Enter', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(field(), '@an');
    await user.keyboard('{ArrowDown}{Enter}');
    // Second suggestion (Ana Beltran) gets her own slug — never the shared
    // `@Ana` that used to fan the mention out to both members.
    expect(field()).toHaveValue('@ana-beltran ');

    // The list closed with the insert, so the next Enter is a newline again.
    await user.keyboard('{Enter}next line');
    expect(field()).toHaveValue('@ana-beltran \nnext line');
  });

  it('dismisses the list with Escape without touching the text', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(field(), '@an');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field()).toHaveValue('@an');
  });

  it('never offers the viewer themselves', async () => {
    const user = userEvent.setup();
    renderComposer();

    // '@yo' is the viewer's own first name — nothing to suggest.
    await user.type(field(), '@yo');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('Yonatane Mekete')).toBeNull();

    // Everyone else is still offered.
    await user.type(field(), '{Backspace}{Backspace}{Backspace}@a');
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
  });

  it('stays quiet when nothing matches', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(field(), 'hey @zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
