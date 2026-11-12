import { useEffect, type RefObject } from 'react';
import { FightDirector } from '../combat/fightDirector';
import { ArenaRenderer } from '../combat/render/arenaRenderer';
import {
  combatDragonAttackImage,
  combatDragonImage,
  combatJobImage,
  preloadCombatImages,
} from '../combat/render/combatImages';
import { fitCanvas } from '../combat/render/layout';
import { createArenaFx, fxPolicy, fxTime } from '../fx/runtime/fxInstance';
import type { FightSession } from '../services/fight';
import type { PendingFight } from '../services/gameClient';
import { isLocalControl, type FighterCard } from '../types/fightView';

/**
 * Binds the session to the canvas: DPR-aware fit of the 960×540 logical view, one render per
 * animation frame (the session's), sim events → FX/audio through the director.
 */
export function useArenaRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  stageRef: RefObject<HTMLDivElement | null>,
  session: FightSession | null,
  fight: PendingFight,
  cards: readonly [FighterCard, FighterCard],
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!session || !canvas || !stage || !ctx) return;
    preloadCombatImages(
      fight.setup.b ? [fight.setup.a.job, fight.setup.b.job] : [fight.setup.a.job],
      fight.setup.kind === 'dragonFight',
    );
    const look = (c: FighterCard) => ({ name: c.name, color: c.color, crest: c.crest });
    const renderer = new ArenaRenderer(
      document,
      {
        a: look(cards[0]),
        b: cards[1].seat === null ? null : look(cards[1]),
        fighterImage: combatJobImage,
        dragonImage: combatDragonImage,
        dragonAttackImage: combatDragonAttackImage,
      },
      session.frame().curr,
      fight.seed,
    );
    const arenaFx = createArenaFx({ seed: fight.seed });
    const director = new FightDirector(
      arenaFx,
      renderer,
      {
        kind: fight.setup.kind,
        rules: session.frame().curr.rules,
        origin: { x: renderer.rect.x, y: renderer.rect.y },
        localSides: cards.filter((c) => isLocalControl(c.control)).map((c) => c.side),
        replay: fight.replay !== null,
      },
      () => fxTime.now(),
    );

    let fit = fitCanvas(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    const applyFit = () => {
      fit = fitCanvas(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
      canvas.width = fit.pixelW;
      canvas.height = fit.pixelH;
      canvas.style.width = `${fit.cssW}px`;
      canvas.style.height = `${fit.cssH}px`;
    };
    applyFit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyFit);
    observer?.observe(stage);

    const off = session.onFrame((frame, events, dt) => {
      director.handle(events, frame.curr);
      renderer.render(ctx, frame, {
        scale: fit.scale,
        now: fxTime.now(),
        dtMs: fxTime.scaledDelta(Math.min(dt, 100)),
        fx: arenaFx,
        softFlash: !fxPolicy().flash,
      });
    });
    return () => {
      off();
      observer?.disconnect();
      arenaFx.clear();
    };
  }, [session, fight, cards, canvasRef, stageRef]);
}
