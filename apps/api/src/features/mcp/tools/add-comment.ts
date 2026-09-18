import { MCP_TOOL_NAMES, addCommentArgumentsSchema } from '@shipyard/shared';
import type { McpToolEntry } from '../registry.js';
import { commentsService } from '../../comments/service.js';
import {
  listResult,
  resolveIssueRef,
  toolInputSchema,
  type McpToolContext,
} from './context.js';

/**
 * `shipyard_add_comment` — say something on an issue, in the person's voice.
 *
 * The one write whose scope is its own (`COMMENTS_WRITE`): a connection allowed
 * to edit work is not automatically allowed to speak on somebody's behalf, so
 * the two permissions are separable at issuance.
 *
 * Mentions are the service's business — it re-parses the text against the live
 * member directory and notifies each person it finds, never the author — so the
 * tool passes the body through untouched and reports who was notified. The
 * result does **not** echo the comment back (the model wrote it, and every
 * echoed token is one it pays for on every later turn) and it carries no author
 * address, in line with the rest of this surface.
 */
async function handler(raw: unknown, tool: McpToolContext) {
  const args = addCommentArgumentsSchema.parse(raw);
  const { context, credential } = tool;

  const found = await resolveIssueRef(args.issue, tool);
  if (!found.ok) return found.result;

  const issue = found.value;
  const comment = await commentsService.create(
    context,
    credential.userId,
    issue.id,
    { content: args.body },
  );

  const notified = comment.mentions.map((mention) => `@${mention.name}`);

  return listResult({
    heading: `Commented on ${issue.identifier}`,
    note: 'saved',
    lines: [
      `${issue.identifier} ${issue.title}`,
      ...(notified.length === 0
        ? ['- nobody was mentioned, so nobody was notified']
        : [`- notified: ${notified.join(', ')}`]),
    ],
    structured: {
      comment: {
        issue: issue.identifier,
        mentions: comment.mentions.map((mention) => mention.name),
        createdAt: comment.createdAt,
      },
    },
  });
}

export const addCommentTool: McpToolEntry = {
  scope: 'COMMENTS_WRITE',
  argumentsSchema: addCommentArgumentsSchema,
  definition: {
    name: MCP_TOOL_NAMES.addComment,
    title: 'Comment on an issue',
    description: [
      'Add a comment to an issue — the way to leave a note, an update or a question on the work.',
      'Write it as the person this connection belongs to; the comment is attributed to them, and editing or deleting it afterwards is not offered here.',
      'Mention a teammate by writing @Name and the workspace notifies them; do not also announce the mention in your reply.',
      'Body is plain text, up to 10,000 characters. It appears under the issue for everybody in the workspace to read.',
      'Use shipyard_get_issue first if you need to read the existing conversation before adding to it.',
    ].join(' '),
    inputSchema: toolInputSchema(addCommentArgumentsSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  handler,
};
