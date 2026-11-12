import { ERROR_CODES, type LobbySeat, type RoomStateMsg } from '@dragon-rush/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobChooser } from '../src/components/lobby/JobChooser';
import { RoomStatusBanner } from '../src/components/lobby/RoomStatusBanner';
import {
  buildRoomView,
  CLIENT_ERROR_CODES,
  connectErrorCode,
  errorText,
  MODEL_PLACEHOLDER_CHOICE,
  nicknameError,
  normalizeRoomCode,
  parseSeatChoice,
  ROOM_STATUS_ICON,
  ROOM_STATUS_LABEL,
  roomCodeError,
  seatChoiceGroups,
  seatChoiceOf,
  startEligibility,
} from '../src/types/onlineLobby';
import { ICON_NAMES } from '../src/types/icons';

vi.mock('../src/services/assets', () => ({ resolveAsset: () => null }));

const seat = (index: number, patch: Partial<LobbySeat> = {}): LobbySeat => ({
  seat: index,
  kind: 'empty',
  playerId: null,
  nickname: null,
  job: null,
  ready: false,
  connected: false,
  botName: null,
  modelId: null,
  ...patch,
});

const human = (index: number, playerId: string, nickname: string, patch: Partial<LobbySeat> = {}) =>
  seat(index, { kind: 'human', playerId, nickname, connected: true, ...patch });

/** Host Alice + guest Bob + an open human seat + a closed seat (the server's default layout). */
const room = (seats: LobbySeat[] = [], patch: Partial<RoomStateMsg> = {}): RoomStateMsg => ({
  roomCode: 'ABC234',
  hostId: 'p_alice',
  status: 'lobby',
  options: { maxRounds: null },
  seats:
    seats.length > 0
      ? seats
      : [
          human(0, 'p_alice', 'Alice'),
          human(1, 'p_bob', 'Bob'),
          seat(2, { kind: 'human' }),
          seat(3),
        ],
  ...patch,
});

describe('lobby inputs', () => {
  it('validates nicknames like the server', () => {
    expect(nicknameError('')).toBe('닉네임을 입력하세요.');
    expect(nicknameError('   ')).toBe('닉네임을 입력하세요.');
    expect(nicknameError('가'.repeat(17))).toContain('16자');
    expect(nicknameError('a<b')).toContain('쓸 수 없습니다');
    expect(nicknameError('용사 김씨')).toBeNull();
    expect(nicknameError('가'.repeat(16))).toBeNull();
  });

  it('normalizes and checks room codes', () => {
    expect(normalizeRoomCode(' ab-c2 34x9 ')).toBe('ABC234');
    expect(roomCodeError('ABC23')).toContain('6자리');
    expect(roomCodeError('ABCDE1')).toContain('I, O, 0, 1');
    expect(roomCodeError('ABC234')).toBeNull();
  });
});

describe('lobby errors', () => {
  it('has Korean text for every server and client error code', () => {
    for (const code of [...ERROR_CODES, ...CLIENT_ERROR_CODES]) {
      const text = errorText(code);
      expect(text).not.toContain(code);
      expect(text).toMatch(/[가-힣]/);
    }
    expect(errorText('SOMETHING_NEW')).toContain('SOMETHING_NEW');
  });

  it('maps handshake failures', () => {
    expect(connectErrorCode(new Error('PROTOCOL_MISMATCH'))).toBe('PROTOCOL_MISMATCH');
    expect(connectErrorCode(new Error('websocket error'))).toBe('CONNECT_FAILED');
    expect(connectErrorCode('nope')).toBe('CONNECT_FAILED');
  });
});

describe('seat choices', () => {
  it('round-trips every option the host can pick', () => {
    const groups = seatChoiceGroups([
      { id: 'my-model', obsVersion: 'obs_v1', actVersion: 'act_v1' },
    ]);
    const values = groups.flatMap((g) => g.options.map((o) => o.value));
    expect(values).toEqual([
      'human',
      'bot:heuristic',
      'bot:heuristic:aggro',
      'bot:heuristic:growth',
      'bot:heuristic:rush',
      'bot:random',
      'model:my-model',
      'empty',
    ]);
    expect(parseSeatChoice(2, 'bot:heuristic:rush')).toEqual({
      seat: 2,
      kind: 'bot',
      botName: 'heuristic:rush',
    });
    expect(parseSeatChoice(3, 'model:my-model')).toEqual({
      seat: 3,
      kind: 'model',
      modelId: 'my-model',
    });
    expect(parseSeatChoice(1, 'empty')).toEqual({ seat: 1, kind: 'empty' });
    expect(parseSeatChoice(1, 'bot:smart')).toBeNull();
    expect(parseSeatChoice(1, MODEL_PLACEHOLDER_CHOICE)).toBeNull();
    expect(seatChoiceOf(seat(2, { kind: 'bot', botName: 'heuristic:aggro' }))).toBe(
      'bot:heuristic:aggro',
    );
    expect(seatChoiceOf(seat(2, { kind: 'human' }))).toBe('human');
  });

  it('disables model seats until the server lists a model', () => {
    const model = seatChoiceGroups([]).find((g) => g.label === '모델')!;
    expect(model.options).toEqual([
      { value: MODEL_PLACEHOLDER_CHOICE, label: '모델 (준비 중)', disabled: true },
    ]);
  });
});

describe('start eligibility', () => {
  it('needs two active seats', () => {
    const alone = room([
      human(0, 'p_alice', 'Alice', { job: 'mage' }),
      seat(1, { kind: 'human' }),
      seat(2),
      seat(3),
    ]);
    const r = startEligibility(alone, 'p_alice');
    expect(r.canStart).toBe(false);
    expect(r.reasons.join()).toContain('2명 이상');
  });

  it('needs every human to have a job and every guest to be ready', () => {
    const r = startEligibility(room(), 'p_alice');
    expect(r.canStart).toBe(false);
    expect(r.reasons).toEqual([
      '내 직업을 먼저 고르세요.',
      'Bob님이 직업을 고르지 않았습니다.',
      'Bob님이 아직 준비하지 않았습니다.',
    ]);
  });

  it('allows the host to start once guests are ready (AI jobs may stay random)', () => {
    const ok = room([
      human(0, 'p_alice', 'Alice', { job: 'mage' }),
      human(1, 'p_bob', 'Bob', { job: 'ninja', ready: true }),
      seat(2, { kind: 'bot', botName: 'heuristic', ready: true, connected: true }),
      seat(3),
    ]);
    expect(startEligibility(ok, 'p_alice')).toEqual({ canStart: true, reasons: [] });
    expect(startEligibility(ok, 'p_bob').canStart).toBe(false);
    expect(startEligibility({ ...ok, status: 'playing' }, 'p_alice').canStart).toBe(false);
  });

  it('allows two ready humans to select the same job', () => {
    const shared = room([
      human(0, 'p_alice', 'Alice', { job: 'mage' }),
      human(1, 'p_bob', 'Bob', { job: 'mage', ready: true }),
      seat(2),
      seat(3),
    ]);
    expect(startEligibility(shared, 'p_alice')).toEqual({ canStart: true, reasons: [] });
    const html = renderToStaticMarkup(
      createElement(JobChooser, {
        seatNumber: 1,
        value: 'mage',
        optional: false,
        disabled: false,
        onChange: () => {},
      }),
    );
    expect(html).not.toContain('disabled=');
    expect(html).not.toContain('다른 좌석이 선택함');
  });
});

describe('room view', () => {
  const full = room([
    human(0, 'p_alice', 'Alice', { job: 'mage' }),
    human(1, 'p_bob', 'Bob', { job: 'ninja', ready: true }),
    seat(2, {
      kind: 'bot',
      botName: 'heuristic:rush',
      job: 'archer',
      ready: true,
      connected: true,
    }),
    seat(3, { kind: 'human' }),
  ]);

  it('gives the host seat controls for open and AI seats only', () => {
    const v = buildRoomView(full, 'p_alice');
    expect(v.isHost).toBe(true);
    expect(v.hostName).toBe('Alice');
    expect(v.activeCount).toBe(3);
    expect(v.seats.map((s) => s.configurable)).toEqual([false, false, true, true]);
    expect(v.seats.map((s) => s.jobEditable)).toEqual([true, false, true, false]);
    expect(v.seats.map((s) => s.statusLabel)).toEqual(['방장', '준비 완료', 'AI', '빈 자리']);
    expect(v.seats[2]!.title).toBe('봇 · 용 러시형');
    expect(v.seats[2]!.choice).toBe('bot:heuristic:rush');
    expect(v.seats[0]!.isMe && v.seats[0]!.isHost).toBe(true);
    expect(v.me.needsReady).toBe(false);
  });

  it('shows a guest only their own controls and ready state', () => {
    const v = buildRoomView(full, 'p_bob');
    expect(v.isHost).toBe(false);
    expect(v.seats.map((s) => s.configurable)).toEqual([false, false, false, false]);
    expect(v.seats.map((s) => s.jobEditable)).toEqual([false, true, false, false]);
    expect(v.me).toEqual({
      seat: 1,
      job: 'ninja',
      ready: true,
      needsReady: true,
      readyBlocker: null,
    });
  });

  it('asks for a job before ready and marks disconnected players', () => {
    const r = room([
      human(0, 'p_alice', 'Alice'),
      human(1, 'p_bob', 'Bob', { connected: false }),
      seat(2),
      seat(3),
    ]);
    const v = buildRoomView(r, 'p_bob');
    expect(v.me.readyBlocker).toBe('직업을 먼저 고르세요.');
    expect(v.seats[1]!.statusLabel).toBe('연결 끊김');
    expect(v.seats[1]!.jobHint).toBe('직업 미선택');
    expect(v.seats[2]!.statusLabel).toBe('닫힘');
  });

  it('locks everything outside the lobby', () => {
    const v = buildRoomView({ ...full, status: 'finished' }, 'p_alice');
    expect(v.seats.some((s) => s.configurable || s.jobEditable)).toBe(false);
    expect(v.me.needsReady).toBe(false);
  });
});

describe('finished room banner', () => {
  it('offers the host a rematch in the same room', () => {
    const host = renderToStaticMarkup(
      createElement(RoomStatusBanner, {
        status: 'finished',
        busy: false,
        isHost: true,
        onOpenGame: () => {},
        onRematch: () => {},
      }),
    );
    expect(host).toContain('같은 방에서 다시 하기');
    expect(host).not.toContain('새 방 만들기');
    const guest = renderToStaticMarkup(
      createElement(RoomStatusBanner, {
        status: 'finished',
        busy: false,
        isHost: false,
        onOpenGame: () => {},
        onRematch: () => {},
      }),
    );
    expect(guest).toContain('방장이 다시 시작하면');
    expect(guest).not.toContain('같은 방에서 다시 하기');
  });
});

describe('lobby icons', () => {
  const emoji = /\p{Extended_Pictographic}/u;

  it('draws seat kinds and states with game-icons instead of emoji', () => {
    const a = buildRoomView(
      room([
        human(0, 'p_alice', 'Alice', { job: 'mage' }),
        human(1, 'p_bob', 'Bob', { job: 'ninja', ready: true }),
        seat(2, { kind: 'bot', botName: 'heuristic', ready: true, connected: true }),
        seat(3, { kind: 'human' }),
      ]),
      'p_alice',
    );
    const b = buildRoomView(
      room([
        human(0, 'p_alice', 'Alice'),
        human(1, 'p_bob', 'Bob', { connected: false }),
        seat(2, { kind: 'model', modelId: 'my-model', ready: true, connected: true }),
        seat(3),
      ]),
      'p_alice',
    );
    const c = buildRoomView(
      room([human(0, 'p_alice', 'Alice'), human(1, 'p_bob', 'Bob'), seat(2), seat(3)]),
      'p_alice',
    );
    expect(a.seats.map((s) => [s.kindIcon, s.statusIcon])).toEqual([
      ['human', 'crown'],
      ['human', 'ready'],
      ['bot', 'bot'],
      ['cooldown', 'key'],
    ]);
    expect(b.seats.map((s) => [s.kindIcon, s.statusIcon])).toEqual([
      ['human', 'crown'],
      ['human', 'disconnected'],
      ['model', 'model'],
      ['lock', 'lock'],
    ]);
    expect(c.seats[1]!.statusIcon).toBe('cooldown');
    for (const s of [...a.seats, ...b.seats, ...c.seats]) {
      expect(ICON_NAMES).toContain(s.kindIcon);
      expect(ICON_NAMES).toContain(s.statusIcon);
      for (const text of [s.title, s.kindLabel, s.statusLabel, s.jobHint]) {
        expect(text).not.toMatch(emoji);
      }
    }
  });

  it('has an icon for every room status', () => {
    for (const status of ['lobby', 'playing', 'finished'] as const) {
      expect(ICON_NAMES).toContain(ROOM_STATUS_ICON[status]);
      expect(ROOM_STATUS_LABEL[status]).not.toMatch(emoji);
    }
  });
});
