export type HardwareBounds = { left: number; top: number; width: number; height: number };
type PointerSample = { x: number; y: number; scroll: number; pointerActive: boolean; reduced: boolean };

/** Bounds are measured at rest, so the hit area never chases a rotating card. */
export function hardwareTarget(frame: PointerSample, bounds: HardwareBounds) {
  if (!frame.pointerActive || frame.reduced || !bounds.width || !bounds.height) return { x: 0, y: 0, active: false };
  const x = (frame.x - bounds.left) / bounds.width;
  const y = (frame.y + frame.scroll - bounds.top) / bounds.height;
  const active = x >= -0.15 && x <= 1.15 && y >= -0.15 && y <= 1.15;
  return { x: active ? Math.max(-1, Math.min(1, (x - .5) * 2)) : 0, y: active ? Math.max(-1, Math.min(1, (y - .5) * 2)) : 0, active };
}
