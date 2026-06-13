/**
 * Zod schemas for every inbound (client->server) payload. The server is
 * untrusting: every event is validated against one of these before any game,
 * money, or signaling logic runs. Wire types are inferred from the schemas so
 * the validator and the TypeScript type can never diverge.
 */

import { z } from 'zod';
import {
  INVITE_CODE_LEN,
  MAX_CHAT_LEN,
  MAX_ICE_CANDIDATE_BYTES,
  MAX_NICKNAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_SDP_BYTES,
  MAX_SEATS,
  MIN_NICKNAME_LEN,
  MIN_PASSWORD_LEN,
  MIN_SEATS,
} from './config.js';

const intChips = z.number().int().nonnegative();
const tableId = z.string().min(1).max(64);
const seatNo = z.number().int().min(0).max(MAX_SEATS - 1);

// ── Auth / profile (REST bodies) ──────────────────────────────────────────────
export const emailSchema = z.string().email().max(254).transform((s) => s.trim().toLowerCase());
export const passwordSchema = z.string().min(MIN_PASSWORD_LEN).max(MAX_PASSWORD_LEN);
export const nicknameSchema = z
  .string()
  .trim()
  .min(MIN_NICKNAME_LEN)
  .max(MAX_NICKNAME_LEN)
  .regex(/^[\p{L}\p{N}_\- ]+$/u, 'nickname has invalid characters');

export const registerInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  nickname: nicknameSchema,
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LEN),
});
export type LoginInput = z.infer<typeof loginInput>;

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LEN),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;

export const updateProfileInput = z.object({
  nickname: nicknameSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

// ── Room / table (socket payloads) ────────────────────────────────────────────
export const createRoomInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    maxSeats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
    smallBlind: z.number().int().positive(),
    bigBlind: z.number().int().positive(),
    minBuyIn: intChips,
    maxBuyIn: intChips,
    isPrivate: z.boolean(),
  })
  .refine((c) => c.smallBlind < c.bigBlind, { message: 'smallBlind must be < bigBlind' })
  .refine((c) => c.minBuyIn <= c.maxBuyIn, { message: 'minBuyIn must be <= maxBuyIn' })
  .refine((c) => c.minBuyIn >= c.bigBlind, { message: 'minBuyIn must be >= bigBlind' });
export type CreateRoomInput = z.infer<typeof createRoomInput>;

export const resolveInviteInput = z.object({
  code: z.string().length(INVITE_CODE_LEN),
});
export type ResolveInviteInput = z.infer<typeof resolveInviteInput>;

export const joinTableInput = z.object({ tableId });
export type JoinTableInput = z.infer<typeof joinTableInput>;

export const leaveTableInput = z.object({ tableId });
export type LeaveTableInput = z.infer<typeof leaveTableInput>;

export const sitInput = z.object({
  tableId,
  seatNo,
  buyIn: intChips,
});
export type SitInput = z.infer<typeof sitInput>;

export const standInput = z.object({ tableId });
export type StandInput = z.infer<typeof standInput>;

export const readyInput = z.object({ tableId, ready: z.boolean() });
export type ReadyInput = z.infer<typeof readyInput>;

export const actionTypeSchema = z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']);

/**
 * Client action. MUST carry expectedVersion (turn token) for stale-action
 * rejection and clientActionId (idempotency). amount is the total street "to"
 * amount for bet/raise; omitted for fold/check/call/allin.
 */
export const tableActionInput = z.object({
  tableId,
  handId: z.string().min(1),
  clientActionId: z.string().min(1).max(64),
  expectedVersion: z.number().int().nonnegative(),
  type: actionTypeSchema,
  amount: z.number().int().nonnegative().optional(),
});
export type TableActionInput = z.infer<typeof tableActionInput>;

export const chatSendInput = z.object({
  tableId,
  text: z.string().trim().min(1).max(MAX_CHAT_LEN),
});
export type ChatSendInput = z.infer<typeof chatSendInput>;

// ── Voice signaling (bounded SDP/ICE; relayed opaquely) ───────────────────────
const userId = z.string().min(1).max(64);

export const voiceJoinInput = z.object({ tableId });
export type VoiceJoinInput = z.infer<typeof voiceJoinInput>;

export const voiceLeaveInput = z.object({ tableId });
export type VoiceLeaveInput = z.infer<typeof voiceLeaveInput>;

export const voiceOfferInput = z.object({
  tableId,
  toUserId: userId,
  sdp: z.string().max(MAX_SDP_BYTES),
});
export type VoiceOfferInput = z.infer<typeof voiceOfferInput>;

export const voiceAnswerInput = z.object({
  tableId,
  toUserId: userId,
  sdp: z.string().max(MAX_SDP_BYTES),
});
export type VoiceAnswerInput = z.infer<typeof voiceAnswerInput>;

export const voiceIceInput = z.object({
  tableId,
  toUserId: userId,
  candidate: z.string().max(MAX_ICE_CANDIDATE_BYTES),
});
export type VoiceIceInput = z.infer<typeof voiceIceInput>;
