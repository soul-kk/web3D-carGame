/**
 * 赛道设计器：按"直道 + 圆弧"排一段赛道，然后自动把它合严实。
 *
 * 【和 make-track.mjs 的区别】那边的闭合求解器用阻尼最小二乘，
 * 段数一多就容易发散（NaN）。这个版本只解两个未知量（两根自由直道），
 * 用 2×2 牛顿迭代，几轮就收敛，也不会把节奏改乱。
 *
 * 另外它会直接把闭合后的控制点打印出来，顺带打印每段的长度 / 半径 /
 * 弯内最高速，以及"直道区间"（断桥和加速带要放的地方）。
 *
 * 用法：node tools/design-track.mjs <草稿文件>
 *   草稿导出 default: [{ straight: 230 }, { arc: { radius, deg, dir } }, ...]
 *   草稿导出 close: [段下标, 段下标]   —— 这两根直道是自由变量
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = process.argv[2];
const mod = await import(pathToFileURL(resolve(file)).href);
const segments = mod.default;
const options = mod.options ?? {};

/** 按弧长走一遍，返回终点位置和朝向 */
function trace(segs) {
  let x = 0, z = 0, dir = options.heading ?? 0;
  const points = [[x, z]];
  const rows = [];
  let travelled = 0;
  for (const seg of segs) {
    if (seg.straight !== undefined) {
      const len = seg.straight;
      const steps = Math.max(1, Math.round(len / 8));
      for (let i = 1; i <= steps; i++) {
        const d = (len * i) / steps;
        points.push([x + Math.cos(dir) * d, z + Math.sin(dir) * d]);
      }
      x += Math.cos(dir) * len;
      z += Math.sin(dir) * len;
      travelled += len;
      rows.push({ type: '直道', len, from: travelled - len, to: travelled, dir });
    } else {
      const { radius, deg, dir: turn } = seg.arc;
      const sign = turn === 'right' ? -1 : 1;
      const arcLen = (Math.abs(deg) * Math.PI / 180) * radius;
      const steps = Math.max(3, Math.round(Math.abs(deg) / 5));
      for (let i = 1; i <= steps; i++) {
        const a = (deg * i) / steps;
        const cx = x + Math.cos(dir + sign * Math.PI / 2) * radius;
        const cz = z + Math.sin(dir + sign * Math.PI / 2) * radius;
        const startAngle = Math.atan2(z - cz, x - cx);
        points.push([
          cx + Math.cos(startAngle + sign * a * Math.PI / 180) * radius,
          cz + Math.sin(startAngle + sign * a * Math.PI / 180) * radius,
        ]);
      }
      const last = points[points.length - 1];
      x = last[0]; z = last[1];
      dir += sign * deg * Math.PI / 180;
      travelled += arcLen;
      rows.push({ type: `弯 ${turn === 'right' ? '右' : '左'} ${Math.abs(deg)}°`, radius, len: arcLen, from: travelled - arcLen, to: travelled });
    }
  }
  return { x, z, dir, points, rows, travelled };
}

/* ---- 闭合求解：把所有直道当未知数，高斯-牛顿 + 正则（保持节奏） ----
 *
 * 【为什么不用两根直道解两个方程】方向接近平行的两根直道会让雅可比接近奇异，
 * 解出来是天文数字。这里把所有直道一起调，再用 λ‖δ‖² 把改动压在最小，
 * 于是"哪根直道该变长"由几何决定，"节奏不被改乱"由正则项保证。
 */
const pinned = new Set(mod.pinned ?? []);
const straightIdx = segments.map((s, i) => (s.straight !== undefined ? i : -1)).filter((i) => i >= 0);
const free = straightIdx.filter((i) => !pinned.has(i));
const design = new Map(free.map((i) => [i, segments[i].straight]));

if (free.length >= 2) {
  const evaluate = () => {
    const r = trace(segments);
    return { ex: r.x, ez: r.z };
  };
  let lambda = 0.5;
  for (let iter = 0; iter < 300; iter++) {
    const base = evaluate();
    const err = Math.hypot(base.ex, base.ez);
    if (err < 0.02) break;

    const J = [[], []];
    for (const k of free) {
      const backup = segments[k].straight;
      segments[k].straight = backup + 1;
      const bumped = evaluate();
      segments[k].straight = backup;
      J[0].push(bumped.ex - base.ex);
      J[1].push(bumped.ez - base.ez);
    }

    const n = free.length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] = J[0][i] * J[0][j] + J[1][i] * J[1][j];
      A[i][i] += lambda;
      b[i] = -(J[0][i] * base.ex + J[1][i] * base.ez);
    }
    const delta = solve(A, b);
    if (!delta) break;

    /* 限制单步幅度，并且别让直道偏离设计值太远 */
    const applied = free.map((k, i) => {
      const target = segments[k].straight + Math.max(-20, Math.min(20, delta[i]));
      return { k, target };
    });
    const backup = free.map((k) => segments[k].straight);
    for (const { k, target } of applied) segments[k].straight = Math.min(420, Math.max(5, target));
    const after = evaluate();
    if (Math.hypot(after.ex, after.ez) > err) {
      /* 这一步变差了：把步长减半再试 */
      for (let i = 0; i < free.length; i++) {
        segments[free[i]].straight = backup[i] + (applied[i].target - backup[i]) * 0.5;
      }
      lambda = Math.min(4, lambda * 1.5);
    } else {
      lambda = Math.max(0.15, lambda * 0.85);
    }
  }
}

/** 高斯消元解 A x = b */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

const built = trace(segments);
const gap = Math.hypot(built.x, built.z);

/* ---- 均匀重采样成控制点 ---- */
const STEP = 6;
const closed = [...built.points, built.points[0]];
const lengths = [0];
for (let i = 1; i < closed.length; i++) {
  lengths.push(lengths[i - 1] + Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]));
}
const total = lengths[lengths.length - 1];
const count = Math.round(total / STEP);
const out = [];
let seg = 0;
for (let i = 0; i < count; i++) {
  const target = (total * i) / count;
  while (seg < lengths.length - 2 && lengths[seg + 1] < target) seg++;
  const span = lengths[seg + 1] - lengths[seg] || 1;
  const f = (target - lengths[seg]) / span;
  out.push([
    Number((closed[seg][0] + (closed[seg + 1][0] - closed[seg][0]) * f).toFixed(1)),
    Number((closed[seg][1] + (closed[seg + 1][1] - closed[seg][1]) * f).toFixed(1)),
  ]);
}
if (options.center) {
  const cx = out.reduce((s, p) => s + p[0], 0) / out.length;
  const cz = out.reduce((s, p) => s + p[1], 0) / out.length;
  for (const p of out) { p[0] = Number((p[0] - cx).toFixed(1)); p[1] = Number((p[1] - cz).toFixed(1)); }
}

/* ---- 中心线 + 半径剖面 ---- */
const curve = new THREE.CatmullRomCurve3(
  out.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5,
);
const realLength = curve.getLength();
const SAMPLES = 2000, WINDOW = 10;
const tangents = [];
for (let i = 0; i < SAMPLES; i++) tangents.push(curve.getTangentAt(i / SAMPLES));
const radii = [];
for (let i = 0; i < SAMPLES; i++) {
  const a = tangents[i], b = tangents[(i + WINDOW) % SAMPLES];
  const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  radii.push(angle > 1e-5 ? (WINDOW / SAMPLES) * realLength / angle : Infinity);
}

/* ---- 俯视图 ---- */
const COLS = 110, ROWS = 42;
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const [x, z] of out) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
}
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
const put = (x, z, ch) => {
  const c = Math.round((x - minX) / (maxX - minX) * (COLS - 1));
  const r = Math.round((z - minZ) / (maxZ - minZ) * (ROWS - 1));
  if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r][c] = ch;
};
for (let i = 0; i < SAMPLES; i++) {
  const p = curve.getPointAt(i / SAMPLES);
  put(p.x, p.z, '.');
}
for (let i = 0; i < SAMPLES; i++) {
  if (radii[i] >= 45) continue;
  const p = curve.getPointAt(i / SAMPLES);
  put(p.x, p.z, radii[i] < 32 ? '#' : 'o');
}

let turn = 0;
for (const seg of segments) if (seg.arc) turn += seg.arc.deg * (seg.arc.dir === 'right' ? -1 : 1);

console.log(`总长 ${realLength.toFixed(0)} m   转向总和 ${turn}°   闭合残差 ${gap.toFixed(2)} m   包围盒 ${(maxX - minX).toFixed(0)}×${(maxZ - minZ).toFixed(0)} m`);
console.log('图例  . 普通路面   o 中速弯(R<45)   # 急弯(R<32)');
console.log(grid.map((r) => r.join('')).join('\n'));

console.log('\n直道区间：');
let cur = null;
const straights = [];
for (let i = 0; i < SAMPLES; i++) {
  if (radii[i] > 60) {
    if (!cur) cur = { from: i / SAMPLES, to: i / SAMPLES };
    else cur.to = i / SAMPLES;
  } else if (cur) { straights.push(cur); cur = null; }
}
if (cur) straights.push(cur);
for (const s of straights) {
  const len = (s.to - s.from) * realLength;
  if (len < 20) continue;
  console.log(`  t ${s.from.toFixed(3)}~${s.to.toFixed(3)}  ${len.toFixed(0)} m`);
}

console.log('\n急弯（R < 45）：');
let prev = -99;
for (let i = 0; i < SAMPLES; i++) {
  if (radii[i] < 45 && i - prev > 25) {
    console.log(`  t ${(i / SAMPLES).toFixed(3)}  半径 ${radii[i].toFixed(0)} m`);
    prev = i;
  }
}

console.log('\n分段：');
for (const row of built.rows) {
  console.log(`  t ${(row.from / total).toFixed(3)}~${(row.to / total).toFixed(3)}  ${row.type.padEnd(14)} ${String(Math.round(row.len)).padStart(4)} m`);
}

console.log('\n控制点（粘贴进 maps.js）：');
const flat = out.flatMap(([x, z]) => [x, z]);
const lines = [];
for (let i = 0; i < flat.length; i += 12) lines.push('    ' + flat.slice(i, i + 12).join(', ') + ',');
console.log(lines.join('\n'));
