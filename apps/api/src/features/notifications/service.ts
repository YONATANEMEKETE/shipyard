import type { DbClient } from '../comments/repository.js';

/**
 * Notifications service — F6 owns this module.
 *
 * STUB (F8 forward-compat): the comments module calls the two functions
 * below inside its transactions (data-model §7 contract). The `notification`
 * table does not exist yet, so both are intentional no-ops that resolve the
 * contract shape — mention joins remain the source of truth for "who would
 * be notified". The F6 step replaces these bodies with real row writes (and
 * adds routes/schema); no comments-module changes will be needed.
 */

export interface MentionEvent {
  workspaceId: string;
  issueId: string;
  commentId: string;
  recipientId: string;
  actorId: string | null;
}

export const notificationsService = {
  /** Fan out one mention notification per event (F6 implements). */
  async createMention(_event: MentionEvent, _tx: DbClient): Promise<void> {
    void _event;
    void _tx;
    return Promise.resolve();
  },

  /** Retract a comment's mention notifications on comment delete (F6 implements). */
  async deleteForComment(_commentId: string, _tx: DbClient): Promise<void> {
    void _commentId;
    void _tx;
    return Promise.resolve();
  },
};

export type NotificationsService = typeof notificationsService;
