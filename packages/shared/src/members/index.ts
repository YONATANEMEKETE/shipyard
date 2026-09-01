import { z } from 'zod';
import { workspaceRoleSchema } from '../workspace/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Members contracts
//
// Owned by the members module (F3). Consumed by both the API (server-side
// validation, response shapes) and the web app (forms, mutations, preview).
// Mirrors the Prisma enums in apps/api/prisma/schema.prisma (data-model.md §2).
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (mirror Prisma) ──

export const invitationStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'DECLINED',
  'EXPIRED',
]);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

// Canonical invitation TTL — keep in sync with api env INVITATION_TTL_DAYS (default 7)
export const INVITATION_TTL_DAYS = 7;

// ── Request contracts ──

export const inviteMembersSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(20),
  role: z.enum(['MEMBER', 'ADMIN']),
});

export type InviteMembersRequest = z.infer<typeof inviteMembersSchema>;

export const resendInvitationSchema = z.object({
  invitationId: z.string().cuid(),
});

export type ResendInvitationRequest = z.infer<typeof resendInvitationSchema>;

export const revokeInvitationSchema = z.object({
  invitationId: z.string().cuid(),
});

export type RevokeInvitationRequest = z.infer<typeof revokeInvitationSchema>;

export const changeMemberRoleSchema = z.object({
  role: z.enum(['MEMBER', 'ADMIN']),
});

export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleSchema>;

export const removeMemberSchema = z.object({
  memberId: z.string().cuid(),
});

export type RemoveMemberRequest = z.infer<typeof removeMemberSchema>;

export const transferOwnershipSchema = z.object({
  targetMemberId: z.string().min(1),
});

export type TransferOwnershipRequest = z.infer<typeof transferOwnershipSchema>;

// Re-export shared confirmation helper from workspace to keep a single source
// (workspace already exports confirmActionSchema/ConfirmActionRequest).
// Members consumers import from the workspace barrel or shared root.

// ── Response contracts ──

export const workspaceMemberCardSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
  role: workspaceRoleSchema,
  createdAt: z.string().datetime(),
});

export type WorkspaceMemberCard = z.infer<typeof workspaceMemberCardSchema>;

export const invitationCardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string().email(),
  role: workspaceRoleSchema,
  status: invitationStatusSchema,
  token: z.string(),
  expiresAt: z.string().datetime(),
  createdById: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type InvitationCard = z.infer<typeof invitationCardSchema>;

export const invitationPreviewSchema = z.object({
  workspaceName: z.string(),
  workspaceIcon: z.string().nullable(),
  // lets the client navigate into the workspace (or redirect existing
  // members straight there instead of showing an accept card)
  workspaceSlug: z.string(),
  role: workspaceRoleSchema,
  email: z.string().email(),
  expiresAt: z.string().datetime(),
  status: invitationStatusSchema,
  // true when the calling user already holds a membership in this workspace,
  // so the UI can skip the accept card and go straight to the workspace
  isMember: z.boolean(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
