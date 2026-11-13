import { poseTransform, type CameraBeat, type CameraPose } from '../types/camera';

export function animateCameraPose(
  element: HTMLElement,
  beat: CameraBeat,
  speed: number,
  previous: CameraPose,
): Animation {
  const current = getComputedStyle(element).transform;
  const animation = element.animate(
    [
      { transform: current && current !== 'none' ? current : poseTransform(previous) },
      { transform: poseTransform(beat.pose) },
    ],
    { duration: beat.ms / speed, easing: beat.easing, fill: 'forwards' },
  );
  // The target is also the underlying pose, so anchor observers wake even for timer-started WAAPI.
  element.style.transform = poseTransform(beat.pose);
  return animation;
}

export function resetCameraPose(element: HTMLElement): void {
  element.style.removeProperty('transform');
}
