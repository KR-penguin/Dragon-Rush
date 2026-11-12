import { Q, type CombatEvent, type CombatState } from '@dragon-rush/combat';
import type { ArenaFx } from '../fx/runtime/arenaFx';
import type { ArenaRenderer } from './render/arenaRenderer';
import { fightFxFor, type FightFxCommand, type FightFxContext } from './fightFx';

/**
 * Applies the pure event → effect mapping to the arena: ArenaFx (sparks, numbers, camera, sound
 * through the screen runtime) and the renderer's sprite reactions. One per fight screen.
 */
export class FightDirector {
  constructor(
    private readonly fx: ArenaFx,
    private readonly renderer: ArenaRenderer,
    private readonly ctx: FightFxContext,
    private readonly now: () => number,
  ) {}

  handle(events: readonly CombatEvent[], state: CombatState): void {
    for (const e of events) for (const cmd of fightFxFor(e, this.ctx)) this.apply(cmd, state);
  }

  private apply(cmd: FightFxCommand, s: CombatState): void {
    switch (cmd.type) {
      case 'cues':
        this.fx.play(cmd.cues);
        return;
      case 'hit': {
        const aimed = cmd.dirX !== 0 || cmd.dirY !== 0;
        this.fx.hit({
          x: cmd.x,
          y: cmd.y,
          damage: cmd.damage,
          kind: cmd.kind,
          dirX: aimed ? cmd.dirX : undefined,
          dirY: aimed ? cmd.dirY : undefined,
          target: cmd.target,
          evaded: cmd.evaded,
          breath: cmd.breath,
          mine: cmd.mine,
          sound: cmd.sound,
        });
        return;
      }
      case 'kick':
        this.fx.kick(cmd.dirX, cmd.dirY, cmd.px);
        return;
      case 'zoom':
        this.fx.zoomPunch(cmd.amount);
        return;
      case 'flinch':
        this.renderer.flinch(cmd.who, cmd.dir, cmd.ticks, this.now());
        return;
      case 'ko':
        this.renderer.knockOut(cmd.who, this.now());
        return;
      case 'callout': {
        const f = cmd.who === 'a' ? s.a : cmd.who === 'b' ? s.b : null;
        const p = f ? this.renderer.toView(f.x / Q, f.y / Q - 52) : null;
        if (p)
          this.fx.play([
            { type: 'text', kind: 'heavy', text: cmd.text, at: { kind: 'point', ...p } },
          ]);
        return;
      }
    }
  }
}
