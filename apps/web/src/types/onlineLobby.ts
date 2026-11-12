import type { JobId } from '@dragon-rush/engine';
import {
  ERROR_CODES,
  NicknameSchema,
  ROOM_CODE_ALPHABET,
  type ErrorCode,
  type LobbySeat,
  type LobbySeatKind,
  type ModelInfo,
  type RoomConfigureSeat,
  type RoomStateMsg,
  type RoomStatus,
} from '@dragon-rush/protocol';
import type { IconName } from './icons';
import { botLabel } from './labels';
import { BOT_OPTIONS } from './setupForm';

export const NICKNAME_MAX = 16;
export const ROOM_CODE_LENGTH = 6;
export const MIN_ACTIVE_SEATS = 2;
export const ONLINE_MAX_ROUND_OPTIONS: readonly (number | null)[] = [null, 10, 15, 20];

/* ---------- Inputs ---------- */

/** Korean validation message for a nickname, or null when the server will accept it. */
export function nicknameError(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return '닉네임을 입력하세요.';
  if (trimmed.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자 이하로 입력하세요.`;
  if (!NicknameSchema.safeParse(raw).success) return '닉네임에 < > { } 같은 문자는 쓸 수 없습니다.';
  return null;
}

/** Uppercases and strips separators so pasted codes like "abc-123" still work. */
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function roomCodeError(code: string): string | null {
  if (code.length !== ROOM_CODE_LENGTH) return `방 코드 ${ROOM_CODE_LENGTH}자리를 입력하세요.`;
  if ([...code].some((ch) => !ROOM_CODE_ALPHABET.includes(ch)))
    return '방 코드에는 I, O, 0, 1이 들어가지 않습니다. 다시 확인하세요.';
  return null;
}

/* ---------- Connection ---------- */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  idle: '연결 안 됨',
  connecting: '서버에 연결하는 중…',
  connected: '서버 연결됨',
  reconnecting: '연결이 끊겨 다시 연결하는 중…',
  offline: '연결 안 됨',
};

/* ---------- Errors ---------- */

/** Failures detected on the client side (no server error code). */
export const CLIENT_ERROR_CODES = [
  'CONNECT_FAILED',
  'TIMEOUT',
  'DISCONNECTED',
  'SESSION_REPLACED',
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type LobbyErrorCode = ErrorCode | ClientErrorCode;

const ERROR_TEXT: Record<LobbyErrorCode, string> = {
  PROTOCOL_MISMATCH: '게임 버전이 서버와 다릅니다. 페이지를 새로고침하세요.',
  INVALID_PAYLOAD: '요청 형식이 올바르지 않습니다. 입력을 확인하세요.',
  SESSION_INVALID: '세션이 만료되었습니다. 다시 접속하세요.',
  ROOM_NOT_FOUND: '방을 찾을 수 없습니다. 방 코드를 확인하세요.',
  ROOM_FULL: '방이 가득 찼습니다. 빈 사람 좌석이 없습니다.',
  ROOM_IN_PROGRESS: '이미 게임이 진행 중인 방입니다.',
  NOT_IN_ROOM: '방에 참가하고 있지 않습니다.',
  NOT_HOST: '방장만 할 수 있습니다.',
  SEAT_OCCUPIED: '이미 플레이어가 앉아 있는 좌석입니다.',
  JOB_TAKEN: '다른 좌석이 이미 고른 직업입니다.',
  NOT_READY: '아직 시작할 수 없습니다. 모든 플레이어가 직업을 고르고 준비해야 합니다.',
  NOT_YOUR_TURN: '지금은 내 차례가 아닙니다.',
  STALE_VERSION: '게임 상태가 바뀌었습니다. 다시 시도하세요.',
  ILLEGAL_ACTION: '지금은 할 수 없는 행동입니다.',
  MODEL_NOT_FOUND: '모델을 찾을 수 없습니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  INTERNAL: '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.',
  CONNECT_FAILED: '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.',
  TIMEOUT: '서버 응답이 없습니다. 연결 상태를 확인하세요.',
  DISCONNECTED: '서버와 연결되어 있지 않습니다.',
  SESSION_REPLACED: '다른 탭이나 창에서 같은 세션으로 접속해 이 화면의 연결이 끊겼습니다.',
};

const isLobbyErrorCode = (code: string): code is LobbyErrorCode =>
  (ERROR_CODES as readonly string[]).includes(code) ||
  (CLIENT_ERROR_CODES as readonly string[]).includes(code);

export function errorText(code: string): string {
  return isLobbyErrorCode(code) ? ERROR_TEXT[code] : `알 수 없는 오류가 발생했습니다. (${code})`;
}

/** Maps a failed handshake (Error.message is the server's code or a transport message). */
export function connectErrorCode(error: unknown): LobbyErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  return (ERROR_CODES as readonly string[]).includes(message)
    ? (message as ErrorCode)
    : 'CONNECT_FAILED';
}

/* ---------- Seat configuration (host) ---------- */

/** Select value for a seat setting: `human` | `empty` | `bot:<botName>` | `model:<modelId>`. */
export type SeatChoice = string;

export interface SeatChoiceOption {
  readonly value: SeatChoice;
  readonly label: string;
  readonly disabled: boolean;
}

export interface SeatChoiceGroup {
  readonly label: string;
  readonly options: readonly SeatChoiceOption[];
}

export const MODEL_PLACEHOLDER_CHOICE = 'model';

export function seatChoiceOf(seat: LobbySeat): SeatChoice {
  switch (seat.kind) {
    case 'bot':
      return `bot:${seat.botName ?? 'heuristic'}`;
    case 'model':
      return seat.modelId ? `model:${seat.modelId}` : MODEL_PLACEHOLDER_CHOICE;
    case 'human':
    case 'empty':
      return seat.kind;
  }
}

type BotName = NonNullable<RoomConfigureSeat['botName']>;
const isBotName = (v: string): v is BotName => BOT_OPTIONS.some((o) => o.id === v);

/** Turns a select value back into a `room:configureSeat` payload; null for invalid values. */
export function parseSeatChoice(seat: number, value: SeatChoice): RoomConfigureSeat | null {
  if (value === 'human' || value === 'empty') return { seat, kind: value };
  const sep = value.indexOf(':');
  if (sep < 0) return null;
  const kind = value.slice(0, sep);
  const arg = value.slice(sep + 1);
  if (kind === 'bot' && isBotName(arg)) return { seat, kind: 'bot', botName: arg };
  if (kind === 'model' && arg !== '') return { seat, kind: 'model', modelId: arg };
  return null;
}

export function seatChoiceGroups(models: readonly ModelInfo[]): SeatChoiceGroup[] {
  return [
    {
      label: '사람',
      options: [{ value: 'human', label: '사람 대기', disabled: false }],
    },
    {
      label: '봇',
      options: BOT_OPTIONS.map((o) => ({
        value: `bot:${o.id}`,
        label: `봇 · ${o.label}`,
        disabled: false,
      })),
    },
    {
      label: '모델',
      options:
        models.length > 0
          ? models.map((m) => ({
              value: `model:${m.id}`,
              label: `모델 · ${m.id}`,
              disabled: false,
            }))
          : [{ value: MODEL_PLACEHOLDER_CHOICE, label: '모델 (준비 중)', disabled: true }],
    },
    {
      label: '닫기',
      options: [{ value: 'empty', label: '닫힘', disabled: false }],
    },
  ];
}

/* ---------- Room view model ---------- */

export type SeatTone = 'host' | 'ready' | 'waiting' | 'ai' | 'open' | 'closed' | 'offline';

export interface SeatView {
  /** Lobby seat index. */
  readonly seat: number;
  readonly kind: LobbySeatKind;
  readonly occupied: boolean;
  readonly kindIcon: IconName;
  readonly kindLabel: string;
  readonly title: string;
  readonly job: JobId | null;
  readonly jobHint: string;
  readonly statusLabel: string;
  readonly statusIcon: IconName;
  readonly tone: SeatTone;
  readonly connected: boolean;
  readonly isMe: boolean;
  readonly isHost: boolean;
  /** Host may change what sits here (seats without a player, lobby only). */
  readonly configurable: boolean;
  readonly choice: SeatChoice;
  /** The viewer may pick this seat's job (own seat, or an AI seat for the host). */
  readonly jobEditable: boolean;
  /** AI seats may leave the job empty; the server picks a free one at start. */
  readonly jobOptional: boolean;
}

export interface StartEligibility {
  readonly canStart: boolean;
  readonly reasons: readonly string[];
}

export interface MyLobbyState {
  readonly seat: number | null;
  readonly job: JobId | null;
  readonly ready: boolean;
  /** Non-host humans toggle ready; the host starts instead. */
  readonly needsReady: boolean;
  readonly readyBlocker: string | null;
}

export interface RoomView {
  readonly code: string;
  readonly status: RoomStatus;
  readonly isHost: boolean;
  readonly hostName: string;
  readonly maxRounds: number | null;
  readonly seats: readonly SeatView[];
  readonly activeCount: number;
  readonly me: MyLobbyState;
  readonly start: StartEligibility;
}

const isAi = (s: LobbySeat) => s.kind === 'bot' || s.kind === 'model';

/** Seats that will play when the game starts (mirrors the server's start check). */
export const activeSeats = (room: RoomStateMsg): LobbySeat[] =>
  room.seats.filter((s) => isAi(s) || (s.kind === 'human' && s.playerId !== null));

const seatName = (s: LobbySeat) => s.nickname ?? `좌석 ${s.seat + 1}`;

/** Why the host cannot start yet; empty when the server will accept `room:start`. */
export function startEligibility(room: RoomStateMsg, playerId: string): StartEligibility {
  const reasons: string[] = [];
  if (room.status !== 'lobby') reasons.push('이미 시작된 방입니다.');
  if (room.hostId !== playerId) reasons.push('방장만 게임을 시작할 수 있습니다.');
  const active = activeSeats(room);
  if (active.length < MIN_ACTIVE_SEATS)
    reasons.push(
      `참가자가 ${MIN_ACTIVE_SEATS}명 이상 필요합니다. 친구를 초대하거나 봇을 추가하세요.`,
    );
  for (const s of active) {
    if (s.kind !== 'human') continue;
    const me = s.playerId === playerId;
    if (!s.job)
      reasons.push(
        me ? '내 직업을 먼저 고르세요.' : `${seatName(s)}님이 직업을 고르지 않았습니다.`,
      );
    if (s.playerId !== room.hostId && !s.ready)
      reasons.push(`${seatName(s)}님이 아직 준비하지 않았습니다.`);
  }
  return { canStart: reasons.length === 0, reasons };
}

const KIND_ICON: Record<LobbySeatKind, IconName> = {
  human: 'human',
  bot: 'bot',
  model: 'model',
  empty: 'lock',
};
const KIND_LABEL: Record<LobbySeatKind, string> = {
  human: '사람',
  bot: '봇',
  model: '모델',
  empty: '닫힘',
};

interface SeatStatus {
  label: string;
  tone: SeatTone;
  icon: IconName;
}

function seatStatus(s: LobbySeat, hostId: string): SeatStatus {
  switch (s.kind) {
    case 'empty':
      return { label: '닫힘', tone: 'closed', icon: 'lock' };
    case 'bot':
    case 'model':
      return { label: 'AI', tone: 'ai', icon: KIND_ICON[s.kind] };
    case 'human':
      if (s.playerId === null) return { label: '빈 자리', tone: 'open', icon: 'key' };
      if (!s.connected) return { label: '연결 끊김', tone: 'offline', icon: 'disconnected' };
      if (s.playerId === hostId) return { label: '방장', tone: 'host', icon: 'crown' };
      return s.ready
        ? { label: '준비 완료', tone: 'ready', icon: 'ready' }
        : { label: '준비 중', tone: 'waiting', icon: 'cooldown' };
  }
}

function seatTitle(s: LobbySeat): string {
  switch (s.kind) {
    case 'human':
      return s.nickname ?? '참가 대기 중';
    case 'bot':
      return `봇 · ${botLabel(s.botName ?? undefined)}`;
    case 'model':
      return `모델 · ${s.modelId ?? '?'}`;
    case 'empty':
      return '닫힌 좌석';
  }
}

function jobHint(s: LobbySeat): string {
  if (s.job) return '';
  if (isAi(s)) return '시작할 때 남은 직업 중 무작위';
  if (s.kind === 'human' && s.playerId !== null) return '직업 미선택';
  return '';
}

export function seatView(room: RoomStateMsg, s: LobbySeat, playerId: string): SeatView {
  const amHost = room.hostId === playerId;
  const lobby = room.status === 'lobby';
  const isMe = s.playerId !== null && s.playerId === playerId;
  const status = seatStatus(s, room.hostId);
  return {
    seat: s.seat,
    kind: s.kind,
    occupied: s.playerId !== null,
    kindIcon: s.kind === 'human' && s.playerId === null ? 'cooldown' : KIND_ICON[s.kind],
    kindLabel: KIND_LABEL[s.kind],
    title: seatTitle(s),
    job: s.job,
    jobHint: jobHint(s),
    statusLabel: status.label,
    statusIcon: status.icon,
    tone: status.tone,
    connected: s.connected,
    isMe,
    isHost: s.playerId !== null && s.playerId === room.hostId,
    configurable: lobby && amHost && s.playerId === null,
    choice: seatChoiceOf(s),
    jobEditable: lobby && (isMe || (amHost && isAi(s))),
    jobOptional: isAi(s),
  };
}

export function buildRoomView(room: RoomStateMsg, playerId: string): RoomView {
  const mine = room.seats.find((s) => s.playerId === playerId) ?? null;
  const isHost = room.hostId === playerId;
  const needsReady = mine !== null && !isHost && room.status === 'lobby';
  const host = room.seats.find((s) => s.playerId === room.hostId);
  return {
    code: room.roomCode,
    status: room.status,
    isHost,
    hostName: host?.nickname ?? '방장',
    maxRounds: room.options.maxRounds,
    seats: room.seats.map((s) => seatView(room, s, playerId)),
    activeCount: activeSeats(room).length,
    me: {
      seat: mine?.seat ?? null,
      job: mine?.job ?? null,
      ready: mine?.ready ?? false,
      needsReady,
      readyBlocker: needsReady && !mine?.ready && !mine?.job ? '직업을 먼저 고르세요.' : null,
    },
    start: startEligibility(room, playerId),
  };
}

export const maxRoundsLabel = (maxRounds: number | null): string =>
  maxRounds === null ? '없음' : `${maxRounds}라운드`;

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  lobby: '대기 중',
  playing: '게임 진행 중',
  finished: '게임 종료',
};

export const ROOM_STATUS_ICON: Record<RoomStatus, IconName> = {
  lobby: 'cooldown',
  playing: 'duel',
  finished: 'trophy',
};

/** Text to paste to a friend. */
export const inviteText = (code: string): string =>
  `드래곤 러쉬 온라인 방 코드: ${code}\n온라인 게임 → 방 참가에서 입력하세요.`;
