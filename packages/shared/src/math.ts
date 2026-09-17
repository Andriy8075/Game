export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrapAngle(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0;
  }

  const tau = Math.PI * 2;
  return ((((angle + Math.PI) % tau) + tau) % tau) - Math.PI;
}

export function clampAxis(value: number): -1 | 0 | 1 {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }

  return value > 0 ? 1 : -1;
}

export function normalize(x: number, y: number): { x: number; y: number; length: number } {
  const length = Math.hypot(x, y);
  if (length === 0) {
    return { x: 0, y: 0, length: 0 };
  }

  return { x: x / length, y: y / length, length };
}
