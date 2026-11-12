import { JOB_IDS, ITEM_IDS, UPGRADE_STATS, type GameSetup, type RulesConfig } from '../types';
import { BOARD_SIZE } from '../board';

export class RulesValidationError extends Error {
  override readonly name = 'RulesValidationError';
}

export function validateRules(rules: RulesConfig): void {
  const fail = (msg: string): never => {
    throw new RulesValidationError(msg);
  };
  if (rules.board.length !== BOARD_SIZE) fail(`board must have ${BOARD_SIZE} tiles`);
  if (rules.board[0]?.id !== 'START') fail('tile 0 must be START');
  for (const job of JOB_IDS) {
    const def = rules.jobs[job];
    if (!def || def.hp < 1 || def.atk < 0 || def.def < 0) fail(`invalid job ${job}`);
  }
  for (const item of ITEM_IDS) {
    const def = rules.items[item];
    if (!def || def.price < 0) fail(`invalid item ${item}`);
  }
  for (const stat of UPGRADE_STATS) {
    const up = rules.upgrades[stat];
    if (!up || up.baseCost < 0 || up.costStep < 0 || up.amount < 1) fail(`invalid upgrade ${stat}`);
  }
  if (rules.mysteryDeck.length === 0) fail('mystery deck must not be empty');
  for (const card of rules.mysteryDeck) {
    if (
      card.effects.some((e) => e.kind === 'training' || e.kind === 'shop' || e.kind === 'mystery')
    ) {
      fail(`mystery card ${card.id} must only have automatic effects`);
    }
  }
  if (rules.combat.maxExchanges < 1 || rules.combat.dieSides < 1) fail('invalid combat config');
  if (rules.combat.mode !== 'dice' && rules.combat.mode !== 'external')
    fail('combat.mode must be dice or external');
  if (rules.dragon.hp < 1 || rules.dragon.breathEvery < 1) fail('invalid dragon config');
  if (rules.maxRounds !== null && rules.maxRounds < 1) fail('maxRounds must be null or >= 1');
  if (rules.pvpGraceRounds < 0) fail('pvpGraceRounds must be >= 0');
  if (rules.eventHpFloor < 1) fail('eventHpFloor must be >= 1');
}

export function validateSetup(setup: GameSetup): void {
  const n = setup.seats.length;
  if (n < 2 || n > 4) throw new RulesValidationError('game needs 2 to 4 seats');
  const jobs = new Set(setup.seats.map((s) => s.job));
  if (jobs.size !== n) throw new RulesValidationError('jobs must be unique');
  for (const s of setup.seats) {
    if (!JOB_IDS.includes(s.job)) throw new RulesValidationError(`unknown job ${s.job}`);
  }
}
