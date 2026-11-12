import { useEffect, useRef, type RefObject } from 'react';
import type { GameStore } from '../store/gameStore';
import {
  cameraBeat,
  EASE_RETURN,
  poseTransform,
  REST_POSE,
  type CameraBeat,
  type CameraPose,
} from '../types/camera';

interface DirectorOptions {
  readonly tiltDeg: number;
  readonly reduced: boolean;
}

/**
 * Drives `.camera` with WAAPI beats as events are shown (turn start pan, event tile pulse, fight
 * zoom, return). Writes the transform directly so React never re-renders for camera moves.
 */
export function useCameraDirector(
  store: GameStore,
  cameraRef: RefObject<HTMLElement | null>,
  options: DirectorOptions,
): void {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  useEffect(() => {
    let anim: Animation | null = null;
    let pose: CameraPose = REST_POSE;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const go = (beat: CameraBeat, speed: number) => {
      const el = cameraRef.current;
      if (!el || typeof el.animate !== 'function') return;
      const now = getComputedStyle(el).transform;
      const next = el.animate(
        [{ transform: now && now !== 'none' ? now : poseTransform(pose) }, { transform: poseTransform(beat.pose) }],
        { duration: beat.ms / speed, easing: beat.easing, fill: 'forwards' },
      );
      anim?.cancel();
      anim = next;
      pose = beat.pose;
    };

    const rest = () => {
      if (settle) clearTimeout(settle);
      settle = null;
      anim?.cancel();
      anim = null;
      pose = REST_POSE;
    };

    const unsubscribe = store.subscribe((s, prev) => {
      if (!s.current || s.current === prev.current || !s.display) return;
      if (opts.current.reduced) {
        if (pose !== REST_POSE) rest();
        return;
      }
      const display = s.display;
      const beat = cameraBeat(s.current, {
        tiltDeg: opts.current.tiltDeg,
        board: display.rules.board,
        positionOf: (seat) => {
          const p = display.players.find((x) => x.seat === seat);
          return p && p.alive ? p.position : null;
        },
      });
      if (!beat) return;
      if (settle) clearTimeout(settle);
      settle = null;
      const before = pose;
      go(beat, s.speed);
      if (beat.settleMs !== undefined) {
        settle = setTimeout(
          () => {
            settle = null;
            go({ pose: before, ms: 600, easing: EASE_RETURN }, store.getState().speed);
          },
          (beat.ms + beat.settleMs) / s.speed,
        );
      }
    });
    return () => {
      unsubscribe();
      rest();
    };
  }, [store, cameraRef]);
}
