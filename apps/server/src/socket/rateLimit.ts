/** Token bucket: `perSecond` messages per second with an equal burst. */
export function createRateLimiter(perSecond: number, clock: () => number = Date.now): () => boolean {
  let tokens = perSecond;
  let last = clock();
  return () => {
    const now = clock();
    tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
