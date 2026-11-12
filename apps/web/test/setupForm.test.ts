import { DEFAULT_RULES, JOB_IDS } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  defaultSetup,
  jobStatScale,
  setSeatCount,
  setupErrors,
  toLocalConfig,
  updateSeat,
} from '../src/types/setupForm';

describe('local setup form', () => {
  it('starts as a valid human vs bot table', () => {
    const form = defaultSetup();
    expect(form.seats.map((s) => s.kind)).toEqual(['human', 'bot']);
    expect(setupErrors(form)).toEqual([]);
  });

  it('adds seats with free jobs and clamps to 2..4', () => {
    const four = setSeatCount(defaultSetup(), 4);
    expect(four.seats).toHaveLength(4);
    expect(new Set(four.seats.map((s) => s.job)).size).toBe(4);
    expect(setSeatCount(four, 9).seats).toHaveLength(4);
    expect(setSeatCount(four, 1).seats).toHaveLength(2);
    expect(setSeatCount(four, 2).seats).toEqual(four.seats.slice(0, 2));
  });

  it('lets multiple seats choose the same job', () => {
    const form = defaultSetup();
    const other = form.seats[1]!.job;
    const updated = updateSeat(form, 0, { job: other });
    expect(updated.seats.map((s) => s.job)).toEqual([other, other]);
    expect(setupErrors(updated)).toEqual([]);
  });

  it('renames default names when the seat kind changes, but keeps custom names', () => {
    const form = defaultSetup();
    expect(updateSeat(form, 1, { kind: 'human' }).seats[1]!.name).toBe('플레이어 2');
    const named = updateSeat(form, 1, { name: '드래곤슬레이어' });
    expect(updateSeat(named, 1, { kind: 'human' }).seats[1]!.name).toBe('드래곤슬레이어');
    expect(
      updateSeat(form, 0, { name: '아주아주아주긴이름입니다요' }).seats[0]!.name.length,
    ).toBeLessThanOrEqual(12);
  });

  it('reports blocking errors', () => {
    const form = defaultSetup();
    expect(setupErrors(updateSeat(form, 0, { name: '  ' }))).toContain('이름을 입력하세요.');
    expect(setupErrors(updateSeat(form, 1, { kind: 'model' }))).toContain(
      '모델 좌석은 아직 준비 중입니다.',
    );
  });

  it('converts to a LocalGameClient config', () => {
    const form = { ...updateSeat(defaultSetup(), 1, { bot: 'heuristic:rush' }), maxRounds: 50 };
    const config = toLocalConfig(form);
    expect(config.maxRounds).toBe(50);
    expect(config.seats[0]).toEqual({ name: '플레이어 1', job: 'swordsman', kind: 'human' });
    expect(config.seats[1]).toEqual({
      name: '봇 2',
      job: 'archer',
      kind: 'bot',
      botName: 'heuristic:rush',
    });
  });

  it('chooses a fresh random job for a bot or human each time a game is created', () => {
    const form = updateSeat(defaultSetup(), 1, { job: null });
    expect(setupErrors(form)).toEqual([]);
    expect(toLocalConfig(form, () => 0).seats[1]!.job).toBe(JOB_IDS[0]);
    expect(toLocalConfig(form, () => 0.999).seats[1]!.job).toBe(JOB_IDS.at(-1));
    expect(form.seats[1]!.job).toBeNull();
    expect(updateSeat(form, 1, { kind: 'human' }).seats[1]!.job).toBeNull();
    const human = updateSeat(form, 0, { job: null });
    expect(setupErrors(human)).toEqual([]);
    expect(toLocalConfig(human, () => 0.999).seats[0]!.job).toBe(JOB_IDS.at(-1));
  });

  it('scales stat bars by the strongest job', () => {
    const scale = jobStatScale(DEFAULT_RULES.jobs);
    expect(scale.hp).toBe(Math.max(...JOB_IDS.map((j) => DEFAULT_RULES.jobs[j].hp)));
    expect(scale.atk).toBe(Math.max(...JOB_IDS.map((j) => DEFAULT_RULES.jobs[j].atk)));
  });
});
