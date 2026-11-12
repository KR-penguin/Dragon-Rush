import modelJson from './model.json';
import { OutcomeModelSchema, type OutcomeModel } from './index';

/** Validates the shipped artifact before any UI, bot, or resolver uses it. */
export function bundledOutcomeModel(
  rulesVersion: string,
  combatRulesVersion: string,
  raw: unknown = modelJson,
): OutcomeModel | null {
  const parsed = OutcomeModelSchema.safeParse(raw);
  if (!parsed.success) return null;
  const model = parsed.data;
  return model.rules_version === rulesVersion && model.combat_rules_version === combatRulesVersion
    ? model
    : null;
}
