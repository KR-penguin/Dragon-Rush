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
  const variation = rules.boardVariation;
  if (variation) {
    const fixed = new Set(variation.fixedTiles);
    if (
      fixed.size !== variation.fixedTiles.length ||
      !fixed.has(0) ||
      variation.fixedTiles.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= BOARD_SIZE)
    ) fail('invalid boardVariation.fixedTiles');
    const count = variation.newPerKind;
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > variation.good.length ||
      count > variation.bad.length ||
      2 * count > BOARD_SIZE - fixed.size
    ) fail('invalid boardVariation.newPerKind');
    const baseIds = new Set(rules.board.map((tile) => tile.id));
    const newIds = [...variation.good, ...variation.bad].map((tile) => tile.id);
    if (new Set(newIds).size !== newIds.length || newIds.some((id) => baseIds.has(id)))
      fail('boardVariation tiles must have distinct new ids');
  }
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
  if (
    !Number.isSafeInteger(rules.movement.rollSides) ||
    rules.movement.rollSides < 2 ||
    rules.movement.rollSides > BOARD_SIZE
  )
    fail(`movement.rollSides must be between 2 and ${BOARD_SIZE}`);
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
  if (
    !Number.isFinite(rules.dragon.damageDealtScale) ||
    rules.dragon.damageDealtScale <= 0 ||
    rules.dragon.damageDealtScale > 1
  )
    fail('dragon.damageDealtScale must be within (0, 1]');
  if (rules.maxRounds !== null && rules.maxRounds < 1) fail('maxRounds must be null or >= 1');
  if (rules.pvpGraceRounds < 0) fail('pvpGraceRounds must be >= 0');
  if (!Number.isSafeInteger(rules.pvpWinBonusCoins) || rules.pvpWinBonusCoins < 0)
    fail('pvpWinBonusCoins must be a non-negative safe integer');
  if (rules.eventHpFloor < 1) fail('eventHpFloor must be >= 1');
  if (!Number.isSafeInteger(rules.coinShortfallHpPerCoin) || rules.coinShortfallHpPerCoin < 0)
    fail('coinShortfallHpPerCoin must be a non-negative safe integer');
  if (!Number.isSafeInteger(rules.maxPaidUpgradesPerTurn) || rules.maxPaidUpgradesPerTurn < 0)
    fail('maxPaidUpgradesPerTurn must be a non-negative safe integer');
}

export function validateSetup(setup: GameSetup): void {
  const n = setup.seats.length;
  if (n < 2 || n > 4) throw new RulesValidationError('game needs 2 to 4 seats');
  for (const s of setup.seats) {
    if (!JOB_IDS.includes(s.job)) throw new RulesValidationError(`unknown job ${s.job}`);
  }
}
