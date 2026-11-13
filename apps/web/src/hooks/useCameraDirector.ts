import { useEffect, useRef, type RefObject } from 'react';
import type { GameStore } from '../store/gameStore';
import { animateCameraPose, resetCameraPose } from '../services/cameraMotion';
import {
  cameraBeat,
  EASE_RETURN,
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
    let animatedElement: HTMLElement | null = null;
    let pose: CameraPose = REST_POSE;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const go = (beat: CameraBeat, speed: number) => {
      const el = cameraRef.current;
      if (!el || typeof el.animate !== 'function') return;
      const next = animateCameraPose(el, beat, speed, pose);
      anim?.cancel();
      if (animatedElement && animatedElement !== el) resetCameraPose(animatedElement);
      anim = next;
      animatedElement = el;
      pose = beat.pose;
    };

    const rest = () => {
      if (settle) clearTimeout(settle);
      settle = null;
      anim?.cancel();
      anim = null;
      if (animatedElement) resetCameraPose(animatedElement);
      animatedElement = null;
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
