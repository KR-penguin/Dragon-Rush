/** Token bucket: `perSecond` messages per second with an equal burst. */
export function createRateLimiter(
  perSecond: number,
  clock: () => number = Date.now,
  burst = perSecond,
): () => boolean {
  let tokens = burst;
  let last = clock();
  return () => {
    const now = clock();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
