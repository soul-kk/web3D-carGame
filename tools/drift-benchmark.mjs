/*
 * 确定性驾驶对照：相同地图、相同车型、同样出发速度，对比常规控速入弯
 * 与弯中按手刹、出弯放氮气。直接运行 Car.update 的真实物理，不依赖浏览器。
 * node tools/drift-benchmark.mjs
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAPS } from '../src/world/maps.js';
import { CAR, NITRO, PROPS } from '../src/config.js';
import { Car } from '../src/game/car.js';

const DT = 1 / 60;
const COUNT = 1200;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mod = (n) => (n + COUNT) % COUNT;

function makeTrack(map) {
  const flat = map.controlPoints;
  const controls = Array.from({ length: flat.length / 2 }, (_, i) =>
    new THREE.Vector3(flat[2 * i], 0, flat[2 * i + 1]));
  const curve = new THREE.CatmullRomCurve3(controls, true, 'catmullrom', 0.5);
  const length = curve.getLength();
  const points = Array.from({ length: COUNT }, (_, i) => curve.getPointAt(i / COUNT));
  const headings = points.map((_, i) => {
    const a = points[mod(i - 1)], b = points[mod(i + 1)];
    return Math.atan2(b.x - a.x, b.z - a.z);
  });
  const radius = headings.map((_, i) => {
    const angle = Math.abs(wrap(headings[mod(i + 9)] - headings[mod(i - 9)]));
    return angle < 0.001 ? 1e6 : (18 * length / COUNT) / angle;
  });
  const pads = map.props.boosts.map(({ t, offset = 0 }) => {
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    return { x: p.x + tan.z * offset, z: p.z - tan.x * offset, cooldown: 0 };
  });
  return { length, points, headings, radius, pads, halfWidth: map.width / 2 };
}

function nearest(track, x, z, around) {
  let index = around, best = Infinity;
  // 当前位置附近局部搜索：曲线 1200 点均匀采样，±45 足够覆盖一帧的位移。
  for (let d = -45; d <= 45; d++) {
    const i = mod(around + d), p = track.points[i];
    const dist = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dist < best) { best = dist; index = i; }
  }
  return { index, distance: Math.sqrt(best) };
}

/** 每张地图的区间：入弯前 → 出弯后 60m（给氮气发挥的空间）。 */
const SECTORS = {
  grassland: [[0.13, 0.25], [0.45, 0.68], [0.81, 1.12]],
  volcano: [[0.14, 0.30], [0.31, 0.54], [0.90, 1.12]],
};
const DRIFT_ZONES = {
  grassland: [[0.46, 0.52]],
  volcano: [[0.15, 0.19], [0.32, 0.42]],
};

function drive(map, drift) {
  const track = makeTrack(map);
  const car = new Car();
  car.placeAt(track.points[0], track.headings[0]);
  const speedAtStart = 0; // 两套策略同样静止起步
  car.velocity.set(Math.sin(car.heading) * speedAtStart, Math.cos(car.heading) * speedAtStart);
  let lastIndex = 0, unwrapped = 0, time = 0, offRoad = 0, nitros = 0, driftSeconds = 0;
  const crossings = new Map();
  const sectorIndices = SECTORS[map.id].flat().map((t) => Math.round(t * COUNT));
  const markers = [...sectorIndices, COUNT, COUNT * 2];

  while (time < 150 && unwrapped < COUNT * 2) {
    const near = nearest(track, car.position.x, car.position.z, lastIndex);
    const delta = wrap((near.index - lastIndex) * 2 * Math.PI / COUNT) * COUNT / (2 * Math.PI);
    // 沿赛道的进度，倒车或漂移甩出路面不能凭最近点瞬移跳圈
    if (Math.abs(delta) < 30) unwrapped += delta;
    lastIndex = near.index;
    for (const mark of markers) if (!crossings.has(mark) && unwrapped >= mark) crossings.set(mark, time);
    if (unwrapped >= COUNT * 2) break;

    const speed = car.speed;
    const preview = Math.max(6, Math.min(13, 5 + speed * 0.12));
    const lookIndex = mod(near.index + Math.round(preview / (track.length / COUNT)));
    const target = track.points[lookIndex];
    const angle = Math.atan2(target.x - car.position.x, target.z - car.position.z);
    const steer = Math.max(-1, Math.min(1, wrap(angle - car.heading) * 2.6));
    // 选弯中甩尾且出弯有长直道的路线；断桥上不按手刹。
    const progress = near.index / COUNT;
    const inBend = DRIFT_ZONES[map.id].some(([from, to]) => progress >= from && progress < to);
    const handbrake = drift && inBend && speed >= 24 && near.distance < track.halfWidth - 2;
    const r = Math.min(...Array.from({ length: 38 }, (_, d) => track.radius[mod(near.index + d)]));
    let limit = CAR.maxSpeed;
    if (r < 33) limit = drift ? 37 : 36;
    else if (r < 43) limit = 43;
    else if (r < 53) limit = 48;
    const brake = speed > limit + 1 ? 1 : 0;
    const state = car.update(DT, {
      input: { throttle: brake ? 0 : 1, brake, steer, handbrake },
      canDrive: true,
      onTrack: near.distance < track.halfWidth + 0.8,
      surface: { y: 0, slope: 0 },
    });
    if (near.distance > track.halfWidth + 0.8) offRoad += DT;
    if (state.drifting) driftSeconds += DT;
    if (state.nitroFired) nitros++;
    for (const pad of track.pads) {
      pad.cooldown = Math.max(0, pad.cooldown - DT);
      if (pad.cooldown === 0 && Math.hypot(car.position.x - pad.x, car.position.z - pad.z) < PROPS.boostTriggerRadius) {
        car.applyBoost(CAR.boostDuration);
        pad.cooldown = 0.4;
        break;
      }
    }
    time += DT;
  }
  const sectors = SECTORS[map.id].map(([from, to]) => {
    const start = crossings.get(Math.round(from * COUNT));
    const finish = crossings.get(Math.round(to * COUNT));
    return start === undefined || finish === undefined ? null : finish - start;
  });
  return { time, firstLap: crossings.get(COUNT), completed: unwrapped >= COUNT * 2, offRoad, nitros, driftSeconds, sectors };
}

for (const map of MAPS) {
  const normal = drive(map, false), drifting = drive(map, true);
  process.stdout.write(`${map.name}: 常规 ${normal.time.toFixed(2)}s / 漂移 ${drifting.time.toFixed(2)}s\n`);
  process.stdout.write(`  常规 ${JSON.stringify(normal)}\n  漂移 ${JSON.stringify(drifting)}\n`);
  assert(normal.completed && drifting.completed, '两种跑法都必须完成两圈');
  assert(drifting.nitros > 0 && drifting.driftSeconds > 0.5, '漂移跑法必须实际充能并喷射');
  assert(drifting.time < normal.time, '漂移必须比常规跑法更快');
  assert(drifting.sectors.some((s, i) => s !== null && s < normal.sectors[i]), '代表弯+出弯段漂移必须更快');
  assert(drifting.offRoad < 3 && normal.offRoad < 3, '两种跑法都需要留在路面内');
}

// 直接以相同 dt 驱动真实 Car，验证释放阈值、长短档和加速带默认倍率。
function checkRelease(charge) {
  const car = new Car();
  car.placeAt({ x: 0, z: 0 }, 0);
  car.driftCharge = charge;
  car.handbrake = true;
  const state = car.update(DT, {
    input: { throttle: 1, brake: 0, steer: 0, handbrake: false },
    canDrive: true, onTrack: true, surface: { y: 0, slope: 0 },
  });
  return { car, state };
}
assert.equal(checkRelease(0.49).state.nitroTier, 0);
for (const charge of [NITRO.shortThreshold, 0.99]) {
  const { car, state } = checkRelease(charge);
  assert.equal(state.nitroTier, 1);
  assert.equal(car.boost, NITRO.shortBoostDuration);
  assert.equal(car.boostSpeedFactor, NITRO.shortBoostFactor);
  assert.equal(car.boostAccelFactor, NITRO.shortBoostAccelFactor);
  assert.equal(car.driftCharge, 0);
}
const { car: full, state: fullState } = checkRelease(1);
assert.equal(fullState.nitroTier, 2);
assert.equal(full.boost, NITRO.boostDuration);
assert.equal(full.boostSpeedFactor, CAR.boostFactor);
assert.equal(full.boostAccelFactor, CAR.boostAccelFactor);
const pad = new Car();
pad.applyBoost(CAR.boostDuration);
assert.equal(pad.boostSpeedFactor, CAR.boostFactor);
assert.equal(pad.boostAccelFactor, CAR.boostAccelFactor);
process.stdout.write('氮气阈值和加速带默认倍率：通过\n');
