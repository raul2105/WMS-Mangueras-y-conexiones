type Metric = { scope: string; durationMs: number };

const RING: Metric[] = [];
const MAX = 1000;

export function recordForSnapshot(m: Metric) {
  RING.push(m);
  if (RING.length > MAX) RING.shift();
}

export function getSnapshot(): Record<string, { p50: number; p95: number; max: number; count: number }> {
  const byScope = new Map<string, number[]>();
  for (const m of RING) {
    const arr = byScope.get(m.scope) ?? [];
    arr.push(m.durationMs);
    byScope.set(m.scope, arr);
  }
  const result: Record<string, { p50: number; p95: number; max: number; count: number }> = {};
  for (const [scope, arr] of byScope) {
    arr.sort((a, b) => a - b);
    result[scope] = {
      p50: arr[Math.floor(arr.length * 0.5)] ?? 0,
      p95: arr[Math.floor(arr.length * 0.95)] ?? 0,
      max: arr[arr.length - 1] ?? 0,
      count: arr.length,
    };
  }
  return result;
}

export function clearSnapshot() {
  RING.length = 0;
}
