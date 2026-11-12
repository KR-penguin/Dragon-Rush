import type { GameEvent, SeatId, TileDef } from '@dragon-rush/engine';
import { planeToCamera, tileCenter, LAIR_RECT, type Point } from './boardGeometry';
import { showsEventCard } from './eventCards';

/** Camera transform on `.camera`: a pan in stage px and a zoom about the board centre. */
export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CameraBeat {
  readonly pose: CameraPose;
  readonly ms: number;
  readonly easing: string;
  /** A pulse: after `ms + settleMs` the camera eases back to the pose it held before. */
  readonly settleMs?: number;
}

export const REST_POSE: CameraPose = { x: 0, y: 0, zoom: 1 };
export const EASE_CAMERA = 'cubic-bezier(.2,.7,.2,1)';
export const EASE_RETURN = 'cubic-bezier(.45,0,.55,1)';

export interface CameraContext {
  readonly tiltDeg: number;
  readonly board: readonly TileDef[];
  /** Tile the seat's pawn stands on, or null when it is off the board. */
  readonly positionOf: (seat: SeatId) => number | null;
}

/**
 * Pose that moves `target` a fraction `pull` of the way to the screen centre while zooming.
 * With zoom s about the centre, a point p lands at s*p + t; we want (1 - pull) * p.
 */
export function poseToward(target: Point, pull: number, zoom: number): CameraPose {
  const k = 1 - pull - zoom;
  return { x: round(k * target.x), y: round(k * target.y), zoom };
}

const round = (n: number) => Math.round(n * 10) / 10 || 0;

/** Camera beat for an event (decision sheet §1.4), or null to hold the current pose. */
export function cameraBeat(e: GameEvent, ctx: CameraContext): CameraBeat | null {
  const atTile = (tile: number) => planeToCamera(tileCenter(tile), ctx.tiltDeg);
  switch (e.type) {
    case 'TurnStarted': {
      const tile = ctx.positionOf(e.seat);
      if (tile === null) return null;
      return { pose: poseToward(atTile(tile), 0.08, 1.04), ms: 500, easing: EASE_CAMERA };
    }
    case 'TileResolved': {
      const def = ctx.board[e.tile];
      if (!def || !showsEventCard(def)) return null;
      return {
        pose: poseToward(atTile(e.tile), 0.15, 1.06),
        ms: 250,
        easing: EASE_CAMERA,
        settleMs: 900,
      };
    }
    case 'CombatStarted': {
      if (e.kind === 'dragonFight') {
        const lair = planeToCamera(
          { x: LAIR_RECT.x + LAIR_RECT.w / 2, y: LAIR_RECT.y + LAIR_RECT.h * 0.42 },
          ctx.tiltDeg,
        );
        return { pose: poseToward(lair, 0.6, 1.15), ms: 400, easing: EASE_CAMERA };
      }
      const seat = typeof e.a === 'number' ? e.a : typeof e.b === 'number' ? e.b : null;
      const tile = seat === null ? null : ctx.positionOf(seat);
      if (tile === null) return null;
      return { pose: poseToward(atTile(tile), 0.5, 1.15), ms: 400, easing: EASE_CAMERA };
    }
    case 'TurnEnded':
      return { pose: REST_POSE, ms: 600, easing: EASE_RETURN };
    case 'GameEnded':
      return { pose: { x: 0, y: 0, zoom: 0.96 }, ms: 800, easing: EASE_RETURN };
    default:
      return null;
  }
}

export const poseTransform = (p: CameraPose): string =>
  `translate3d(${p.x}px, ${p.y}px, 0px) scale(${p.zoom})`;
