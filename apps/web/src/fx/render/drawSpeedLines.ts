import type { SpeedLineFrame } from '../core/speedLines';

/** Sparse radial streaks stay in the outer band so the board and arena threats remain legible. */
export function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: SpeedLineFrame,
  color: string,
): void {
  const fade = (1 - frame.progress) ** 2 * frame.strength;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let variation = 0; variation < 5; variation++) {
    const reach = 0.065 + variation * 0.012;
    const travel = frame.progress * 0.035;
    const alpha = fade * (variation % 2 === 0 ? 0.38 : 0.24);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = variation % 3 === 0 ? 2 : 1;
    const sideEnd = (reach + travel) * width;
    const capEnd = (reach + travel) * height;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      if ((i * 7) % 5 !== variation) continue;
      const position = (i + 0.5) / 12;
      const y = position * height;
      const x = position * width;
      const bendY = (height / 2 - y) * 0.12;
      const bendX = (width / 2 - x) * 0.12;
      ctx.moveTo(-8, y);
      ctx.lineTo(sideEnd, y + bendY);
      ctx.moveTo(width + 8, y);
      ctx.lineTo(width - sideEnd, y + bendY);
      ctx.moveTo(x, -8);
      ctx.lineTo(x + bendX, capEnd);
      ctx.moveTo(x, height + 8);
      ctx.lineTo(x + bendX, height - capEnd);
    }
    ctx.stroke();
  }
  ctx.restore();
}
