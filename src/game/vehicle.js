import { Box, Circle, Polygon, WheelJoint, Vec2 } from 'planck';
import { CAT } from './constants.js';

// Every cosmetic skin shares this exact physics model, so unlocks are purely visual.
export const TRUCK = {
  wheelR: 0.46,
  rear: { x: -1.25, y: -0.64 },
  front: { x: 1.3, y: -0.64 },
  bed: { x0: -1.83, x1: 0.44, wallH: 0.46 },
  // local-space zone that still counts as "in the truck"
  zone: { x0: -2.1, x1: 0.7, y0: -0.3, y1: 5.5 },
  spring: { hz: 4.2, damp: 0.72 },
  maxWheelSpeed: 30,   // rad/s  (~13.8 m/s)
  driveTorque: 24,     // per wheel
  accel: 4.6,          // m/s^2 launch limit on flat ground
  slipLead: 1.2,       // m/s the wheels may run ahead of the truck
  brakeTorque: 42,
  brakeDecel: 8.5,     // m/s^2 cap while braking on the ground
  reverseSpeed: 12,
  reverseTorque: 15,
  idleTorque: 1.6,
  holdTorque: 12,
  airTorque: 70,
  airMaxSpin: 3.6,
  airLevel: 30,
  airDamp: 9,
  throttleRise: 3.2,   // per second
  throttleFall: 8,
};

export const CHASSIS_PARTS = [
  // frame / bed floor
  { box: [1.75, 0.2, -0.2, -0.2], density: 1.2 },
  // tailgate
  { box: [0.06, 0.23, -1.89, 0.23], density: 1.2 },
  // hood
  { poly: [[0.44, -0.4], [1.95, -0.4], [1.95, 0.3], [1.72, 0.5], [0.44, 0.5]], density: 1.2 },
  // cabin
  { poly: [[0.44, 0.5], [1.46, 0.5], [1.12, 1.28], [0.44, 1.28]], density: 0.8 },
  // low ballast keeps the truck planted
  { box: [1.2, 0.08, 0.05, -0.3], density: 8 },
];

export function createTruck(world, x, y) {
  const chassis = world.createBody({
    type: 'dynamic', position: Vec2(x, y), allowSleep: false, angularDamping: 0.05,
  });
  chassis.setUserData({ kind: 'truck' });
  const filter = { filterCategoryBits: CAT.TRUCK, filterMaskBits: CAT.GROUND | CAT.CARGO | CAT.OBJ };
  for (const p of CHASSIS_PARTS) {
    const shape = p.box
      ? new Box(p.box[0], p.box[1], Vec2(p.box[2], p.box[3]), 0)
      : new Polygon(p.poly.map(([px, py]) => Vec2(px, py)));
    chassis.createFixture({ shape, density: p.density, friction: 0.6, restitution: 0.05, ...filter, userData: { kind: 'truck' } });
  }

  const makeWheel = (off) => {
    const w = world.createBody({ type: 'dynamic', position: Vec2(x + off.x, y + off.y), allowSleep: false, angularDamping: 0.3 });
    w.setUserData({ kind: 'wheel' });
    w.createFixture({
      shape: new Circle(TRUCK.wheelR), density: 1.5, friction: 1.15, restitution: 0.0,
      filterCategoryBits: CAT.WHEEL, filterMaskBits: CAT.GROUND | CAT.CARGO | CAT.OBJ,
      userData: { kind: 'wheel' },
    });
    const joint = world.createJoint(new WheelJoint({
      motorSpeed: 0, maxMotorTorque: TRUCK.idleTorque, enableMotor: true,
      frequencyHz: TRUCK.spring.hz, dampingRatio: TRUCK.spring.damp,
    }, chassis, w, w.getPosition(), Vec2(0, 1)));
    return { body: w, joint };
  };
  const rear = makeWheel(TRUCK.rear);
  const front = makeWheel(TRUCK.front);
  return { chassis, rear: rear.body, front: front.body, rearJoint: rear.joint, frontJoint: front.joint };
}
