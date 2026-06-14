/**
 * The Socket.IO event protocol — single source of truth, imported by BOTH the
 * server (`Server<ClientToServerEvents, ServerToClientEvents, ...>`) and the web
 * client (`Socket<ServerToClientEvents, ClientToServerEvents>`). Protocol drift
 * becomes a compile error on one side or the other.
 */

import type {
  ChatMessage,
  HandResult,
  HandReveal,
  IceServerConfig,
  InvitePreview,
  PrivateHole,
  RoomListItem,
  TableSnapshot,
} from './domain.js';
import type {
  ChatSendInput,
  CreateRoomInput,
  DeleteRoomInput,
  JoinTableInput,
  LeaveTableInput,
  ReadyInput,
  ResolveInviteInput,
  SitInput,
  StandInput,
  TableActionInput,
  VoiceAnswerInput,
  VoiceIceInput,
  VoiceJoinInput,
  VoiceLeaveInput,
  VoiceOfferInput,
} from './schemas.js';

/** Generic ack envelope for request/response style events. */
export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'room:list': (ack: Ack<RoomListItem[]>) => void;
  'room:create': (input: CreateRoomInput, ack: Ack<{ tableId: string; inviteCode: string }>) => void;
  'room:resolveInvite': (input: ResolveInviteInput, ack: Ack<InvitePreview>) => void;

  'table:join': (input: JoinTableInput, ack: Ack<TableSnapshot>) => void;
  'table:leave': (input: LeaveTableInput, ack: Ack<null>) => void;
  'room:delete': (input: DeleteRoomInput, ack: Ack<null>) => void;

  'seat:sit': (input: SitInput, ack: Ack<TableSnapshot>) => void;
  'seat:stand': (input: StandInput, ack: Ack<null>) => void;
  'seat:ready': (input: ReadyInput, ack: Ack<null>) => void;

  'table:action': (input: TableActionInput, ack: Ack<null>) => void;
  'chat:send': (input: ChatSendInput, ack: Ack<null>) => void;

  // Voice signaling (relayed within the per-table room)
  'voice:join': (input: VoiceJoinInput, ack: Ack<{ iceServers: IceServerConfig[]; peers: string[] }>) => void;
  'voice:leave': (input: VoiceLeaveInput) => void;
  'voice:offer': (input: VoiceOfferInput) => void;
  'voice:answer': (input: VoiceAnswerInput) => void;
  'voice:ice-candidate': (input: VoiceIceInput) => void;
}

export interface ServerToClientEvents {
  // Lobby
  'lobby:rooms': (rooms: RoomListItem[]) => void;

  // Table state — the client mirrors these
  'table:snapshot': (snapshot: TableSnapshot) => void;
  'hand:hole': (hole: PrivateHole) => void;
  'hand:result': (result: HandResult) => void;
  'hand:reveal': (reveal: HandReveal) => void;

  // Chat
  'chat:message': (msg: ChatMessage) => void;

  // Voice signaling
  'voice:peers': (data: { tableId: string; peers: string[] }) => void;
  'voice:peer-joined': (data: { tableId: string; userId: string }) => void;
  'voice:peer-left': (data: { tableId: string; userId: string }) => void;
  'voice:offer': (data: { fromUserId: string; sdp: string }) => void;
  'voice:answer': (data: { fromUserId: string; sdp: string }) => void;
  'voice:ice-candidate': (data: { fromUserId: string; candidate: string }) => void;

  // Room lifecycle
  'table:closed': (data: { tableId: string }) => void;

  // Errors / session
  'session:expired': () => void;
  error: (data: { code: string; message: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

/** Per-socket data populated by the handshake auth middleware. */
export interface SocketData {
  userId: string;
  nickname: string;
  avatarUrl: string;
  role: string;
}
