import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import type { CommentCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { IssueConversation } from '@/components/issues/issue-conversation';

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
    render(<IssueConversation comments={[]} />);
    expect(screen.getByText('No conversation yet')).toBeInTheDocument();
  });

  it('renders each comment with its author and time, oldest first', () => {
    render(
      <IssueConversation
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
      <IssueConversation
        comments={[comment({ editedAt: '2026-12-02T15:00:00.000Z' })]}
      />,
    );
    expect(
      screen.getByText(
        new RegExp(`${stamp('2026-12-02T14:32:00.000Z')} \\(edited\\)`),
      ),
    ).toBeInTheDocument();
  });

  it('renders a resolved mention as an inline chip with the short name', () => {
    render(
      <IssueConversation
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
      <IssueConversation
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
      <IssueConversation
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
      <IssueConversation
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
      <IssueConversation
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
      <IssueConversation
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

describe('IssueConversation — pagination', () => {
  it('offers no control when the thread is complete', () => {
    render(<IssueConversation comments={[comment()]} />);
    expect(
      screen.queryByRole('button', { name: /show more comments/i }),
    ).toBeNull();
  });

  it('asks for the older page only when clicked', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <IssueConversation
        comments={[comment()]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    expect(onLoadMore).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: /show more comments/i }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('locks the control while the older page is in flight', () => {
    render(<IssueConversation comments={[comment()]} hasMore isLoadingMore />);

    const busy = screen.getByRole('button', { name: /loading/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Show more comments')).toBeNull();
  });

  it('sits after the comments it appends to', () => {
    render(
      <IssueConversation
        comments={[comment({ id: 'a', content: 'Newest.' })]}
        hasMore
      />,
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
