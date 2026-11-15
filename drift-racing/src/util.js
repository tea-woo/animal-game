// 공용 수학·포맷 유틸
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v < 0 ? -1 : 1);

export function angleDelta(a, b) {
  let d = (b - a + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}
export const dampAngle = (a, b, l, dt) => a + angleDelta(a, b) * (1 - Math.exp(-l * dt));

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}
