/**
 * 赛道形状预览：把"节奏草稿"或"角点轮廓"直接画成俯视图 + 半径剖面。
 *
 * 【为什么要有】make-track.mjs 只打印数字，看不出形状；
 * 地图好不好看（是不是一个大椭圆、弯有没有节奏）一眼图就清楚。
 *
 * 草稿文件有两种写法：
 *   1) 段式：export default [{ straight: 120 }, { arc: { radius, deg, dir } }, ...]
 *      —— 用 make-track.mjs 的生成器 + 自动闭合求解器
 *   2) 角点：export const points = [[x, z], [x, z], ...]
 *      —— 直接给轮廓角点，样条自己圆滑（想画"有凹陷的形状"时用这个，
 *         段式生成器解出来的形状只会是凸的）
 *
 * 用法：node tools/preview-track.mjs <草稿文件>
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { autoClose, buildTrack } from './make-track.mjs';

const file = process.argv[2];
const mod = await import(pathToFileURL(resolve(file)).href);
const options = mod.options ?? {};

let points;
let rows = [];
let total = 0;

if (mod.points) {
  /* ---- 角点模式：直接用轮廓 ---- */
  points = mod.points.map(([x, z]) => [x, z]);
  total = null;
} else {
  const segments = mod.default;
  if (mod.close !== false) autoClose(segments, mod.close === true ? null : mod.close);
  const built = buildTrack(segments, options);
  points = built.points;
  rows = built.rows;
  total = built.total;
  if (options.center) {
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    for (const p of points) { p[0] -= cx; p[1] -= cz; }
  }
}

/* ---- 中心线 ---- */
const curve = new THREE.CatmullRomCurve3(
  points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5,
);
const length = curve.getLength();

let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of points) {
  minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
  minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
}

/* ---- 俯视图 ---- */
const COLS = 110, ROWS = 42;
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
const put = (x, z, ch) => {
  const c = Math.round((x - minX) / (maxX - minX) * (COLS - 1));
  const r = Math.round((z - minZ) / (maxZ - minZ) * (ROWS - 1));
  if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r][c] = ch;
};
const SAMPLES = 2000;
for (let i = 0; i < SAMPLES; i++) {
  const p = curve.getPointAt(i / SAMPLES);
  put(p.x, p.z, '.');
}

/* ---- 半径剖面：每 1/40 圈算一次曲率半径 ---- */
const WINDOW = 10;
const tangents = [];
for (let i = 0; i < SAMPLES; i++) tangents.push(curve.getTangentAt(i / SAMPLES));
const radiusAt = [];
for (let i = 0; i < SAMPLES; i++) {
  const a = tangents[i];
  const b = tangents[(i + WINDOW) % SAMPLES];
  const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  radiusAt.push(angle > 1e-5 ? (WINDOW / SAMPLES) * length / angle : Infinity);
}

/* 把半径小于阈值的段标成急弯（'#'），中速弯标成 'o' */
const FAST = 45;   // 全油门就能过的最小半径
for (let i = 0; i < SAMPLES; i++) {
  if (radiusAt[i] >= FAST) continue;
  const p = curve.getPointAt(i / SAMPLES);
  put(p.x, p.z, radiusAt[i] < 32 ? '#' : 'o');
}

/* 标出最急的弯 */
const tight = [];
for (let i = 0; i < SAMPLES; i++) {
  if (radiusAt[i] < 40 && (tight.length === 0 || i - tight[tight.length - 1] > 40)) {
    tight.push(i);
  }
}

let turn = 0;
if (!mod.points) {
  for (const seg of mod.default) if (seg.arc) turn += seg.arc.deg * (seg.arc.dir === 'right' ? -1 : 1);
}

console.log(`总长 ${length.toFixed(0)} m   转向总和 ${turn || '—'}°   包围盒 ${(maxX - minX).toFixed(0)}×${(maxZ - minZ).toFixed(0)} m`);
console.log('图例  . 普通路面   o 中速弯(R<45)   # 急弯(R<32)');
console.log(grid.map((r) => r.join('')).join('\n'));

console.log('\n需要减速的弯（R < 45 m，全油门过不去）：');
for (const i of tight) {
  console.log(`  t ${(i / SAMPLES).toFixed(3)}  半径 ${radiusAt[i].toFixed(0)} m`);
}

if (rows.length) {
  console.log('\n分段：');
  for (const row of rows) {
    console.log(`  t ${row.tFrom.toFixed(3)}~${row.tTo.toFixed(3)}  ${row.type.padEnd(16)} ${String(Math.round(row.len)).padStart(4)}m`
      + (row.maxSpeed !== undefined ? `  弯内最高 ${row.maxSpeed.toFixed(1)} m/s` : ''));
  }
}
