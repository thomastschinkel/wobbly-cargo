// Cargo catalogue. Sizes in meters. `fragile` is the velocity change (m/s) that smashes it.
// `face` is where the googly eyes sit (local coords, relative to size).

export const CARGO = {
  crate: {
    name: 'Crate', shape: 'box', w: 0.62, h: 0.62, density: 1.0, friction: 0.75, restitution: 0.04,
    sound: 'wood', color: '#e0a352', dark: '#b8763a', face: { y: 0.04, s: 1 },
  },
  box: {
    name: 'Parcel', shape: 'box', w: 0.68, h: 0.5, density: 0.42, friction: 0.55, restitution: 0.12,
    sound: 'card', color: '#d9b27c', dark: '#b88d58', face: { y: 0.02, s: 0.95 },
  },
  barrel: {
    name: 'Barrel', shape: 'circle', r: 0.31, density: 1.1, friction: 0.6, restitution: 0.08,
    angularDamping: 1.6, sound: 'metal', color: '#3fa7d6', dark: '#2b7aa3', face: { y: 0.02, s: 0.9 },
  },
  melon: {
    name: 'Melon', shape: 'circle', r: 0.3, density: 0.9, friction: 0.8, restitution: 0.05,
    angularDamping: 2.5, fragile: 6.5, sound: 'squish', color: '#5cb85c', dark: '#2f7d3b', face: { y: 0.02, s: 0.95 },
    splat: ['#ff4d5e', '#ff7a86', '#2f7d3b', '#1a1a1a'],
  },
  egg: {
    name: 'Egg', shape: 'egg', w: 0.34, h: 0.44, density: 0.7, friction: 0.7, restitution: 0.04,
    angularDamping: 1.2, fragile: 5.2, sound: 'crack', color: '#fff6e6', dark: '#e3cfae', face: { y: -0.02, s: 0.7 },
    splat: ['#ffd23f', '#fff6e6', '#ffffff'],
  },
  tv: {
    name: 'TV', shape: 'box', w: 0.74, h: 0.56, density: 0.95, friction: 0.65, restitution: 0.03,
    fragile: 6.0, sound: 'glass', color: '#8f6dd9', dark: '#6a4cb0', face: { y: 0.0, s: 0.9 },
    splat: ['#bfe7ff', '#8f6dd9', '#2b2140', '#ffffff'],
  },
  ball: {
    name: 'Beach Ball', shape: 'circle', r: 0.33, density: 0.07, friction: 0.5, restitution: 0.62,
    linearDamping: 0.15, sound: 'rubber', color: '#ffffff', dark: '#d9d9d9', face: { y: 0.0, s: 0.9 },
  },
  gold: {
    name: 'Gold Bar', shape: 'trap', w: 0.56, h: 0.26, density: 5.0, friction: 0.32, restitution: 0.02,
    sound: 'metal', color: '#ffcf3f', dark: '#d99a1c', face: { y: -0.01, s: 0.62 },
  },
  penguin: {
    name: 'Penguin', shape: 'capsule', w: 0.46, h: 0.74, density: 0.8, friction: 0.3, restitution: 0.05,
    sound: 'squeak', color: '#2d2f45', dark: '#1d1e2e', face: { y: 0.16, s: 0.85 },
  },
  cake: {
    name: 'Cake', shape: 'box', w: 0.64, h: 0.54, density: 0.6, friction: 0.7, restitution: 0.02,
    fragile: 5.8, sound: 'squish', color: '#ffc2d9', dark: '#f28bb3', face: { y: -0.06, s: 0.85 },
    splat: ['#ffc2d9', '#fff6e6', '#e8335a', '#8a4b2f'],
  },
  piano: {
    name: 'Piano', shape: 'box', w: 1.25, h: 0.95, density: 1.6, friction: 0.6, restitution: 0.02,
    sound: 'piano', color: '#3b2a4a', dark: '#24182f', face: { y: 0.12, s: 1.3 },
  },
  tnt: {
    name: 'TNT', shape: 'box', w: 0.56, h: 0.56, density: 0.9, friction: 0.7, restitution: 0.03,
    fragile: 7.0, explosive: true, sound: 'wood', color: '#e8423f', dark: '#b52a2a', face: { y: -0.02, s: 0.85 },
    splat: ['#ffcf3f', '#ff7a2f', '#e8423f', '#2b2140'],
  },
  jelly: {
    name: 'Jelly', shape: 'box', w: 0.6, h: 0.5, density: 0.55, friction: 0.35, restitution: 0.5,
    sound: 'squish', color: '#6fe08a', dark: '#3fb862', face: { y: 0.0, s: 0.9 },
  },
  vase: {
    name: 'Vase', shape: 'vase', w: 0.44, h: 0.82, density: 0.9, friction: 0.7, restitution: 0.02,
    angularDamping: 0.4, fragile: 5.6, sound: 'glass', color: '#5fb8e8', dark: '#3a86b8', face: { y: -0.08, s: 0.72 },
    splat: ['#5fb8e8', '#fdf2d8', '#3a86b8', '#ffffff'],
  },
  alien: {
    name: 'Alien', shape: 'capsule', w: 0.5, h: 0.6, density: 0.35, friction: 0.45, restitution: 0.3,
    linearDamping: 0.12, sound: 'squeak', color: '#9be15d', dark: '#62b33a', face: { y: 0.04, s: 0.95 },
  },
  crystal: {
    name: 'Crystal', shape: 'gem', w: 0.5, h: 0.66, density: 1.3, friction: 0.5, restitution: 0.02,
    fragile: 5.0, sound: 'glass', color: '#c48bff', dark: '#8e57e0', face: { y: 0.02, s: 0.7 },
    splat: ['#c48bff', '#f1e0ff', '#8e57e0', '#ffffff'],
  },
};

// convex outlines (fractions of w/h) shared by physics and drawing
export const OUTLINES = {
  vase: [[-0.24, -0.5], [0.24, -0.5], [0.5, -0.12], [0.36, 0.5], [-0.36, 0.5], [-0.5, -0.12]],
  gem: [[0, -0.5], [0.5, 0.08], [0.3, 0.5], [-0.3, 0.5], [-0.5, 0.08]],
};

export function cargoSize(type) {
  const c = CARGO[type];
  if (c.shape === 'circle') return { w: c.r * 2, h: c.r * 2 };
  return { w: c.w, h: c.h };
}

export const CARGO_TIPS = {
  melon: 'Melons are fragile!',
  egg: 'Eggs crack easily!',
  tv: 'Careful, TVs break!',
  ball: 'Beach balls are bouncy!',
  gold: 'Gold is heavy and slides!',
  penguin: 'Penguins slip around!',
  cake: 'Cake! Soft landings!',
  piano: 'One big piano!',
  tnt: 'TNT! Do NOT drop it!',
  barrel: 'Barrels love to roll!',
  jelly: 'Jelly bounces everywhere!',
  vase: 'Tall vases tip over!',
  alien: 'Aliens are light as air!',
  crystal: 'Crystals shatter easily!',
};
