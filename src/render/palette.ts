// One fixed palette for the whole game. Sprite strings index it by character.
export const PAL: Record<string, string> = {
  '0': '#0b0a14',
  '1': '#1f1b2e',
  '2': '#3a3355',
  '3': '#514a72',
  '4': '#6f6a94',
  '5': '#9e9bbd',
  '6': '#d6d4ea',
  '7': '#ffffff',
  a: '#4a1f1a',
  b: '#8a3324',
  c: '#d4572a',
  d: '#f39a3a',
  e: '#ffd27a',
  f: '#fff3c4',
  g: '#0f2c45',
  h: '#1b5a84',
  i: '#2fa3d6',
  j: '#7fe3ff',
  k: '#d4fbff',
  l: '#2a0f2e',
  m: '#561a55',
  n: '#9a2c86',
  o: '#e04aa8',
  p: '#ff9ad6',
  q: '#3d0c18',
  r: '#8c1a2c',
  s: '#e0343c',
  t: '#ff7a6a',
  u: '#17301a',
  v: '#2d6a2a',
  w: '#59b04a',
  x: '#b6e85a',
  y: '#7a5a1c',
  z: '#c8962e',
  Y: '#f2d266',
  Z: '#3a2a10',
  A: '#0e2524',
  B: '#17403c',
  C: '#26655c',
  D: '#3f9a86',
  E: '#7fd4b4',
  F: '#0e1530',
  G: '#1a2856',
  H: '#2c4686',
  I: '#4f74c0',
  J: '#8fb0ee',
  K: '#f2c6a0',
  L: '#c98a6a',
  M: '#2a1a2e',
};

/** Per-zone environment ramps: [deep, dark, mid, light, accent, accent2] */
export const ZONE_RAMP: string[][] = [
  ['#0a1516', '#132726', '#1c3a37', '#2a5650', '#e8b33a', '#5fd0b4'], // subway: teal tile + safety yellow
  ['#140b1c', '#22122e', '#331c44', '#4b2a5e', '#ff5fb8', '#3fd8ff'], // neon market: wet violet + neon
  ['#0a1022', '#121c3a', '#1d2c55', '#2c4278', '#ffb347', '#8fb0ee'], // rooftop: night concrete + amber
  ['#140e08', '#251a0e', '#3a2a14', '#5a421e', '#f2d266', '#e0343c'], // clocktower: brass
];

export const ZONE_SKY = ['#06090a', '#0b0610', '#050818', '#0c0805'];

export const ECHO_MAP: Record<string, string> = {
  // echo palette: anything warm/neutral is remapped into the cyan ramp, preserving value
  '0': '#06223a',
  '1': '#0f2c45',
  '2': '#1b5a84',
  '3': '#1b5a84',
  '4': '#2fa3d6',
  '5': '#2fa3d6',
  '6': '#7fe3ff',
  '7': '#d4fbff',
};

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(h: string): number {
  const [r, g, b] = hexToRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Map any colour to the cyan echo ramp by luminance. */
export function echoColor(h: string): string {
  const L = luminance(h);
  const ramp = ['#06223a', '#0f3a5c', '#1f6fa3', '#2fa3d6', '#7fe3ff', '#d4fbff'];
  return ramp[Math.min(ramp.length - 1, Math.floor(L * ramp.length * 1.05))];
}
