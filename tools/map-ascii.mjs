/**
 * 地图俯视图（ASCII）。
 *
 * 【为什么要有这个】赛道的"形状"是地图设计里最要紧的一件事，
 * 但它是几百个控制点拼出来的曲线 —— 用肉眼看控制点数组是看不出来的。
 * 这个脚本把中心线画成字符画，一眼能看出：
 *   这张图是"一圈大椭圆"还是"有直有弯有回头"
 *   断桥架在哪一段直道上
 *   金币 / 加速带压在什么位置
 *
 * 用法：
 *   node tools/map-ascii.mjs            # 全部地图
 *   node tools/map-ascii.mjs volcano    # 只看某张
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { MAPS } from '../src/world/maps.js';

const COLS = 108;
const ROWS = 42;

/** 复刻 track.js 的中心线 */
function buildCurve(controlPoints) {
  const pairs = Array.isArray(controlPoints[0])
    ? controlPoints
    : Array.from({ length: Math.floor(controlPoints.length / 2) }, (_, i) => [
      controlPoints[i * 2], controlPoints[i * 2 + 1],
    ]);
  return new THREE.CatmullRomCurve3(
    pairs.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true, 'catmullrom', 0.5,
  );
}

/** 复刻 track.js 的 heightAt（断桥） */
function makeHeightAt(bridge) {
  const smoothstep = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  };
  return (t) => {
    if (!bridge) return 0;
    const tt = ((t % 1) + 1) % 1;
    if (tt < bridge.from || tt > bridge.to) return 0;
    if (tt >= bridge.gapFrom && tt <= bridge.gapTo) return null;
    if (tt < bridge.gapFrom) {
      const p = (tt - bridge.from) / (bridge.gapFrom - bridge.from);
      const base = smoothstep(p) * bridge.height;
      const kickStart = bridge.gapFrom - 0.03;
      if (tt > kickStart) {
        const k = (tt - kickStart) / (bridge.gapFrom - kickStart);
        return base + k * k * 3.4;
      }
      return base;
    }
    const p = (tt - bridge.gapTo) / (bridge.to - bridge.gapTo);
    return bridge.height * (1 - smoothstep(p));
  };
}

for (const map of MAPS) {
  if (process.argv[2] && map.id !== process.argv[2]) continue;

  const curve = buildCurve(map.controlPoints);
  const length = curve.getLength();
  const heightAt = makeHeightAt(map.bridge);
  const samples = 1200;

  /* 采样 + 统计包围盒 */
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < samples; i++) {
    const p = curve.getPointAt(i / samples);
    pts.push(p);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }

  /* 字符画网格 */
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
  const put = (x, z, ch) => {
    const c = Math.round((x - minX) / (maxX - minX) * (COLS - 1));
    const r = Math.round((z - minZ) / (maxZ - minZ) * (ROWS - 1));
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
      /* 已有字符时保留"更亮"的那个（后画的覆盖前面的） */
      grid[r][c] = ch;
    }
  };

  const COIN = 'o', BOOST = 'B', GAP = 'X', BRIDGE = '-', ROAD = '.';

  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const p = pts[i];
    const h = heightAt(t);
    if (h === null) { put(p.x, p.z, GAP); continue; }
    const onBridge = map.bridge && t >= map.bridge.from && t <= map.bridge.to;
    put(p.x, p.z, onBridge ? BRIDGE : ROAD);
  }

  /* 道具：金币 / 加速带 */
  const plan = map.props ?? {};
  for (const run of plan.coins?.runs ?? []) {
    for (let k = 0; k < (plan.coins.count ?? 4); k++) {
      const t = (run.t + (k * (plan.coins.spacing ?? 7)) / length) % 1;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const n = new THREE.Vector3(tan.z, 0, -tan.x);
      put(p.x + n.x * (run.offset ?? 0), p.z + n.z * (run.offset ?? 0), COIN);
    }
  }
  for (const pad of plan.boosts ?? []) {
    const p = curve.getPointAt(pad.t);
    const tan = curve.getTangentAt(pad.t);
    const n = new THREE.Vector3(tan.z, 0, -tan.x);
    put(p.x + n.x * (pad.offset ?? 0), p.z + n.z * (pad.offset ?? 0), BOOST);
  }

  console.log(`\n===== ${map.name} (${map.id})  长度 ${length.toFixed(0)} m  路宽 ${map.width} m`);
  if (map.bridge) {
    console.log(`断桥 ${map.bridge.from}~${map.bridge.to}  断口 ${map.bridge.gapFrom}~${map.bridge.gapTo}`
      + `  桥高 ${map.bridge.height} m  断口宽 ${((map.bridge.gapTo - map.bridge.gapFrom) * length).toFixed(1)} m`);
  }
  console.log('图例  . 路面   - 桥面   X 断口   o 金币   B 加速带');
  console.log(grid.map((row) => row.join('')).join('\n'));

  /* 弯道统计：按转角把整圈切成直道 / 弯 */
  const WINDOW = 14;
  const tangents = [];
  for (let i = 0; i < samples; i++) tangents.push(curve.getTangentAt(i / samples));
  const segs = [];
  for (let i = 0; i < samples; i++) {
    const a = tangents[i];
    const b = tangents[(i + WINDOW) % samples];
    const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    const radius = angle > 1e-4 ? (WINDOW / samples) * length / angle : Infinity;
    segs.push({ t: i / samples, radius, angle });
  }
  /* 归并成段 */
  const rows2 = [];
  let cur = null;
  for (let i = 0; i < samples; i++) {
    const s = segs[i];
    const kind = s.radius === Infinity ? '直' : s.radius < 45 ? '急弯' : s.radius < 90 ? '弯' : '缓弯';
    if (!cur || cur.kind !== kind) {
      cur = { kind, t0: s.t, t1: s.t, r: s.radius, dir: 0 };
      rows2.push(cur);
    } else {
      cur.t1 = s.t;
      cur.r = s.radius;
    }
  }
  console.log('分段（直道 / 弯道）：');
  for (const r of rows2) {
    if ((r.t1 - r.t0) * length < 12) continue;
    const len = ((r.t1 - r.t0) * length).toFixed(0);
    const rad = r.r === Infinity ? '—' : `R=${r.r.toFixed(0)}`;
    console.log(`  t ${r.t0.toFixed(3)}~${r.t1.toFixed(3)}  ${r.kind}  ${len} m  ${rad}`);
  }
}
