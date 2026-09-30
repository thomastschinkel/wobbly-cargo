export const DT = 1 / 60;
export const GRAVITY = -12;
export const VEL_ITERS = 10;
export const POS_ITERS = 4;

export const CAT = {
  GROUND: 0x0001,
  TRUCK: 0x0002,
  WHEEL: 0x0004,
  CARGO: 0x0008,
  OBJ: 0x0010,
};

export const MATERIALS = {
  ground: { friction: 0.95 },
  ice: { friction: 0.05 },
  basalt: { friction: 0.95 },
};

export const WORLDS = [
  { id: 'meadow', name: 'Sunny Meadows', first: 1 },
  { id: 'canyon', name: 'Dusty Canyon', first: 11 },
  { id: 'snow', name: 'Frosty Peaks', first: 21 },
  { id: 'volcano', name: 'Volcano Valley', first: 31 },
  { id: 'moon', name: 'Moon Base', first: 41 },
];
