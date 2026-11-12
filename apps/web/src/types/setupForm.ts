import { JOB_IDS, type JobDef, type JobId } from '@dragon-rush/engine';

export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export type SeatKindChoice = 'human' | 'bot' | 'model';

export const BOT_OPTIONS = [
  { id: 'heuristic', label: '무작위' },
  { id: 'heuristic:aggro', label: '공격형' },
  { id: 'heuristic:growth', label: '성장형' },
  { id: 'heuristic:rush', label: '용 러시형' },
  { id: 'random', label: '무작위 정책' },
] as const;
export type BotOptionId = (typeof BOT_OPTIONS)[number]['id'];

export const MAX_ROUND_OPTIONS: readonly (number | null)[] = [null, 50, 100];

export interface SeatForm {
  readonly name: string;
  readonly kind: SeatKindChoice;
  readonly bot: BotOptionId;
  /** Null means this seat draws one of the five jobs when a new game starts. */
  readonly job: JobId | null;
}

export interface SetupForm {
  readonly seats: readonly SeatForm[];
  readonly maxRounds: number | null;
}

/** Structurally matches LocalGameConfig without depending on the service layer. */
export interface LocalSetupConfig {
  readonly seats: { name: string; job: JobId; kind: 'human' | 'bot'; botName?: string }[];
  readonly maxRounds: number | null;
}

const NAME_MAX = 12;

export const defaultSeatName = (index: number, kind: SeatKindChoice): string =>
  kind === 'bot' ? `봇 ${index + 1}` : `플레이어 ${index + 1}`;

const isDefaultName = (name: string, index: number): boolean =>
  name === defaultSeatName(index, 'human') ||
  name === defaultSeatName(index, 'bot') ||
  name.trim() === '';

const firstFreeJob = (seats: readonly SeatForm[]): JobId =>
  JOB_IDS.find((job) => !seats.some((s) => s.job === job)) ?? JOB_IDS[0];

export function defaultSetup(): SetupForm {
  return {
    seats: [
      { name: defaultSeatName(0, 'human'), kind: 'human', bot: 'heuristic', job: 'swordsman' },
      { name: defaultSeatName(1, 'bot'), kind: 'bot', bot: 'heuristic', job: 'archer' },
    ],
    maxRounds: null,
  };
}

export function setSeatCount(form: SetupForm, count: number): SetupForm {
  const n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(count)));
  const seats = form.seats.slice(0, n);
  while (seats.length < n) {
    const i = seats.length;
    seats.push({
      name: defaultSeatName(i, 'bot'),
      kind: 'bot',
      bot: 'heuristic',
      job: firstFreeJob(seats),
    });
  }
  return { ...form, seats };
}

/** Applies a seat edit. Multiple seats may select the same job. */
export function updateSeat(form: SetupForm, index: number, patch: Partial<SeatForm>): SetupForm {
  const seat = form.seats[index];
  if (!seat) return form;
  let next: SeatForm = { ...seat, ...patch };
  if (
    patch.kind !== undefined &&
    patch.kind !== seat.kind &&
    patch.name === undefined &&
    isDefaultName(seat.name, index)
  ) {
    next = { ...next, name: defaultSeatName(index, patch.kind) };
  }
  if (next.name.length > NAME_MAX) next = { ...next, name: next.name.slice(0, NAME_MAX) };
  return { ...form, seats: form.seats.map((s, i) => (i === index ? next : s)) };
}

export function setupErrors(form: SetupForm): string[] {
  const errors: string[] = [];
  if (form.seats.length < MIN_SEATS || form.seats.length > MAX_SEATS) {
    errors.push(`좌석은 ${MIN_SEATS}~${MAX_SEATS}개여야 합니다.`);
  }
  if (form.seats.some((s) => s.name.trim() === '')) errors.push('이름을 입력하세요.');
  if (form.seats.some((s) => s.kind === 'model')) errors.push('모델 좌석은 아직 준비 중입니다.');
  return errors;
}

/** Largest base value of each stat across jobs, for drawing comparable stat bars. */
export function jobStatScale(jobs: Readonly<Record<JobId, JobDef>>): JobDef {
  const all = JOB_IDS.map((j) => jobs[j]);
  return {
    hp: Math.max(...all.map((j) => j.hp)),
    atk: Math.max(...all.map((j) => j.atk)),
    def: Math.max(...all.map((j) => j.def)),
  };
}

export function toLocalConfig(form: SetupForm, pick: () => number = Math.random): LocalSetupConfig {
  return {
    maxRounds: form.maxRounds,
    seats: form.seats.map((s) => {
      const name = s.name.trim();
      const job = s.job ?? JOB_IDS[Math.floor(pick() * JOB_IDS.length)]!;
      if (s.kind === 'bot')
        return {
          name,
          job,
          kind: 'bot',
          botName: s.bot,
        };
      return { name, job, kind: 'human' };
    }),
  };
}
