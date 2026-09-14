import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import type { ComponentProps } from 'react';
import type { CommentCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { IssueConversation } from '@/components/issues/issue-conversation';

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'usr_9',
        name: 'Viewer Person',
        email: 'viewer@harbor.test',
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
          userId: 'usr_9',
          name: 'Viewer Person',
          email: 'viewer@harbor.test',
          image: null,
        },
        {
          userId: 'usr_2',
          name: 'Ana Ruiz',
          email: 'ana@harbor.test',
          image: null,
        },
      ],
    },
  }),
}));

/** The room's directory slug is boilerplate in every case but the editor's. */
function Thread(props: Omit<ComponentProps<typeof IssueConversation>, 'slug'>) {
  return <IssueConversation slug="acme" {...props} />;
}

function comment(overrides: Partial<CommentCard> = {}): CommentCard {
  return {
    id: 'cmt_1',
    workspaceId: 'ws_1',
    issueId: 'iss_1',
    author: {
      userId: 'usr_1',
      name: 'Yonatane Mekete',
      email: 'yonatane@harbor.test',
      image: null,
    },
    content: 'Plain comment.',
    mentions: [],
    editedAt: null,
    createdAt: '2026-12-02T14:32:00.000Z',
    updatedAt: '2026-12-02T14:32:00.000Z',
    ...overrides,
  };
}

/** Same formatting the entry uses — keeps assertions timezone-agnostic. */
function stamp(iso: string): string {
  return format(new Date(iso), 'MMM d, HH:mm');
}

const mention = {
  userId: 'usr_2',
  name: 'Ana Ruiz',
  image: null,
};

describe('IssueConversation', () => {
  it('falls back to the global empty state when there are no comments', () => {
    render(<Thread comments={[]} />);
    expect(screen.getByText('No conversation yet')).toBeInTheDocument();
  });

  it('renders each comment with its author and time, oldest first', () => {
    render(
      <Thread
        comments={[
          comment({ id: 'a', content: 'First.' }),
          comment({
            id: 'b',
            content: 'Second.',
            createdAt: '2026-12-03T09:15:00.000Z',
          }),
        ]}
      />,
    );

    const first = screen.getByText('First.');
    const second = screen.getByText('Second.');
    expect(screen.getAllByText('Yonatane Mekete')).toHaveLength(2);
    expect(
      screen.getByText(stamp('2026-12-02T14:32:00.000Z')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(stamp('2026-12-03T09:15:00.000Z')),
    ).toBeInTheDocument();
    // API order (oldest first) must survive rendering.
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('marks edited comments', () => {
    render(
      <Thread comments={[comment({ editedAt: '2026-12-02T15:00:00.000Z' })]} />,
    );
    expect(
      screen.getByText(
        new RegExp(`${stamp('2026-12-02T14:32:00.000Z')} \\(edited\\)`),
      ),
    ).toBeInTheDocument();
  });

  it('renders a resolved mention as an inline chip with the short name', () => {
    render(
      <Thread
        comments={[
          comment({
            content: '@Ana confirmed — allowlist re-added.',
            mentions: [mention],
          }),
        ]}
      />,
    );

    // Chip carries the design's short form; the surrounding text is untouched.
    expect(screen.getByText('@ana.r')).toBeInTheDocument();
    expect(
      screen.getByText(/confirmed — allowlist re-added\./),
    ).toBeInTheDocument();
  });

  it('matches a token against any word of the mentioned name', () => {
    render(
      <Thread
        comments={[
          comment({
            content: '@Ruiz can you confirm?',
            mentions: [mention],
          }),
        ]}
      />,
    );
    // The handle resolves (a name word), so the chip replaces it.
    expect(screen.getByText('@ana.r')).toBeInTheDocument();
    expect(screen.queryByText(/@Ruiz/)).toBeNull();
  });

  it('resolves the dashed slug written for members who share a first name', () => {
    render(
      <Thread
        comments={[
          comment({
            content: '@ana-beltran can you confirm?',
            mentions: [
              mention,
              { userId: 'usr_3', name: 'Ana Beltran', image: null },
            ],
          }),
        ]}
      />,
    );

    // The slug names one member only — the other Ana is not the match.
    expect(screen.getByText('@ana.b')).toBeInTheDocument();
    expect(screen.queryByText('@ana.r')).toBeNull();
  });

  it('a slug stays literal when it is not one of the resolved mentions', () => {
    render(
      <Thread
        comments={[
          comment({
            content: 'ping @ana-beltran about this',
            mentions: [mention], // only Ana Ruiz resolved
          }),
        ]}
      />,
    );

    expect(screen.getByText(/@ana-beltran/)).toBeInTheDocument();
    expect(screen.queryByText('@ana.r')).toBeNull();
  });

  it('leaves an unresolved token as literal text', () => {
    render(
      <Thread
        comments={[
          comment({
            content: 'ping @Ghost about this',
            mentions: [mention],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/@Ghost/)).toBeInTheDocument();
    expect(screen.queryByText('@ana.r')).toBeNull();
  });

  it('renders mentions mid-sentence without breaking the paragraph', () => {
    render(
      <Thread
        comments={[
          comment({
            content: 'Then @Ana and I paired on it.',
            mentions: [mention],
          }),
        ]}
      />,
    );

    expect(screen.getByText('@ana.r')).toBeInTheDocument();
    expect(screen.getByText(/Then/)).toBeInTheDocument();
    expect(screen.getByText(/and I paired on it\./)).toBeInTheDocument();
  });
});

describe('IssueConversation — author-only actions', () => {
  const own = () => comment({ id: 'own', content: 'Mine to fix.' });
  const other = () =>
    comment({
      id: 'other',
      content: 'Not mine.',
      author: {
        userId: 'usr_2',
        name: 'Ana Ruiz',
        email: 'ana@harbor.test',
        image: null,
      },
    });

  it("offers edit and delete on the viewer's own comment only", () => {
    render(<Thread comments={[own(), other()]} viewerId="usr_1" />);

    // One row is the viewer's, so exactly one set of actions exists. Authorship
    // is per-row, not per-role (spec rule 3).
    expect(
      screen.getAllByRole('button', { name: 'Edit comment' }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Delete comment' }),
    ).toHaveLength(1);
  });

  it('offers nothing when the viewer authored none of the thread', () => {
    render(<Thread comments={[other()]} viewerId="usr_1" />);

    expect(screen.queryByRole('button', { name: 'Edit comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete comment' })).toBeNull();
  });

  it('hides the actions on an archived issue — writes are frozen', () => {
    render(<Thread comments={[own()]} viewerId="usr_1" readOnly />);

    expect(screen.queryByRole('button', { name: 'Edit comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete comment' })).toBeNull();
  });

  it('edits in place and saves the trimmed body', async () => {
    const user = userEvent.setup();
    const onEditComment = vi.fn().mockResolvedValue(undefined);
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onEditComment={onEditComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    const field = screen.getByRole('combobox', { name: 'Edit your comment' });
    expect(field).toHaveValue('Mine to fix.');

    // A same-content save is a server-side no-op, so the action stays off until
    // something actually changed.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(field);
    await user.type(field, '  Mine, fixed.  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEditComment).toHaveBeenCalledExactlyOnceWith(
      'own',
      'Mine, fixed.',
    );
    // The field closes once the save resolves; the body comes back from props.
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });

  it('keeps the editor and the draft when the save fails', async () => {
    const user = userEvent.setup();
    const onEditComment = vi.fn().mockRejectedValue(new Error('403'));
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onEditComment={onEditComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    const field = screen.getByRole('combobox', { name: 'Edit your comment' });
    await user.clear(field);
    await user.type(field, 'Worth keeping.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Nothing the author wrote is lost to a 403/409 — the page owns the toast.
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveValue('Worth keeping.'),
    );
  });

  it('abandons the draft on cancel', async () => {
    const user = userEvent.setup();
    const onEditComment = vi.fn();
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onEditComment={onEditComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'Never mind.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onEditComment).not.toHaveBeenCalled();
    expect(screen.getByText('Mine to fix.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('confirms before deleting and reports the comment id', async () => {
    const user = userEvent.setup();
    const onDeleteComment = vi.fn().mockResolvedValue(undefined);
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onDeleteComment={onDeleteComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete comment' }));

    // A confirmation, not a straight delete — the API wants a literal
    // `confirm: true` and the author should mean it (api-design #5).
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete comment?')).toBeInTheDocument();
    expect(onDeleteComment).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete comment' }),
    );
    expect(onDeleteComment).toHaveBeenCalledExactlyOnceWith('own');
  });

  it('saves on Shift+Enter without waiting for the button', async () => {
    const user = userEvent.setup();
    const onEditComment = vi.fn().mockResolvedValue(undefined);
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onEditComment={onEditComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    const field = screen.getByRole('combobox', { name: 'Edit your comment' });
    await user.clear(field);
    await user.type(field, 'Fixed from the keyboard.');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onEditComment).toHaveBeenCalledExactlyOnceWith(
      'own',
      'Fixed from the keyboard.',
    );
  });

  it('labels the row actions with a tooltip, not a native title', async () => {
    const user = userEvent.setup();
    render(<Thread comments={[own()]} viewerId="usr_1" />);

    const edit = screen.getByRole('button', { name: 'Edit comment' });
    expect(edit).not.toHaveAttribute('title');

    await user.hover(edit);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Edit comment',
    );
  });

  it('shows the pending beat on the confirm while the delete is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onDeleteComment = vi.fn(
      () => new Promise<void>((r) => (resolve = r)),
    );
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onDeleteComment={onDeleteComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete comment' }),
    );

    // The confirm carries the same pending beat as the composer's action, and
    // the overlay stays put until the delete actually lands.
    const busy = await within(dialog).findByRole('button', {
      name: /deleting/i,
    });
    expect(busy).toHaveAttribute('aria-busy', 'true');

    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancels the confirmation without deleting', async () => {
    const user = userEvent.setup();
    const onDeleteComment = vi.fn();
    render(
      <Thread
        comments={[own()]}
        viewerId="usr_1"
        onDeleteComment={onDeleteComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onDeleteComment).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('IssueConversation — pagination', () => {
  it('offers no control when the thread is complete', () => {
    render(<Thread comments={[comment()]} />);
    expect(
      screen.queryByRole('button', { name: /show more comments/i }),
    ).toBeNull();
  });

  it('asks for the older page only when clicked', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<Thread comments={[comment()]} hasMore onLoadMore={onLoadMore} />);

    expect(onLoadMore).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: /show more comments/i }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('locks the control while the older page is in flight', () => {
    render(<Thread comments={[comment()]} hasMore isLoadingMore />);

    const busy = screen.getByRole('button', { name: /loading/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Show more comments')).toBeNull();
  });

  it('sits after the comments it appends to', () => {
    render(
      <Thread comments={[comment({ id: 'a', content: 'Newest.' })]} hasMore />,
    );

    const control = screen.getByRole('button', { name: /show more comments/i });
    const newest = screen.getByText('Newest.');
    // Control renders after the thread: the API's cursor walks forward, so
    // clicking it appends newer comments below the ones already read.
    expect(
      newest.compareDocumentPosition(control) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
