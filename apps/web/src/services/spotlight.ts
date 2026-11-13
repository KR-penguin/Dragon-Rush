/** Follow only the transforms that move the pawn's screen anchor; leaf breathing stays decorative. */
export function observeSpotlight(overlay: HTMLElement, pawn: HTMLElement): () => void {
  const targets = [
    ...new Set([
      pawn,
      ...['.camera', '.board3d', '.stage', '.world-shake'].flatMap((selector) => {
        const element = pawn.closest(selector);
        return element ? [element] : [];
      }),
    ]),
  ];
  let raf = 0;
  let active = true;
  let lastX = -1;
  let lastY = -1;
  const schedule = () => {
    if (active && !raf) raf = requestAnimationFrame(measure);
  };
  const measure = () => {
    raf = 0;
    const rect = pawn.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height * 0.4);
    if (x !== lastX || y !== lastY) {
      overlay.style.setProperty('--px', `${x}px`);
      overlay.style.setProperty('--py', `${y}px`);
      lastX = x;
      lastY = y;
    }
    if (
      targets.some((element) =>
        element
          .getAnimations?.()
          .some((animation) => animation.pending || animation.playState === 'running'),
      )
    )
      schedule();
  };
  const observer = new MutationObserver(schedule);
  const motionEvents = [
    'animationstart',
    'animationend',
    'animationcancel',
    'transitionrun',
    'transitionend',
    'transitioncancel',
  ] as const;
  const detachMotion = targets.map((element) => {
    const onMotion = (event: Event) => {
      if (event.target === element) schedule();
    };
    for (const type of motionEvents) element.addEventListener(type, onMotion);
    return () => {
      for (const type of motionEvents) element.removeEventListener(type, onMotion);
    };
  });
  for (const element of targets)
    observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  measure();
  return () => {
    active = false;
    cancelAnimationFrame(raf);
    observer.disconnect();
    for (const detach of detachMotion) detach();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
  };
}
