/**
 * 角点轮廓 → 赛道控制点。
 *
 * 【为什么需要】make-track.mjs 用"直道 + 圆弧"描述赛道，
 * 但那种描述解出来的形状只能是凸的 —— 想画一个有凹陷、有咬口的赛道
 * 就得直接给轮廓角点，交给样条去圆滑。
 *
 * 这个脚本做三件事：
 *   1. 把角点连成闭合样条
 *   2. 按弧长均匀重采样成控制点（地图里用的就是这种扁平数组）
 *   3. 打印"直道区间"和半径剖面 —— 用来决定断桥架在哪、金币摆哪
 *
 * 用法：node tools/waypoints-to-points.mjs <草稿文件>
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = process.argv[2];
const mod = await import(pathToFileURL(resolve(file)).href);
const points = mod.points;
const step = mod.step ?? 6;

const curve = new THREE.CatmullRomCurve3(
  points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5,
);
const length = curve.getLength();

/* 均匀重采样：控制点间距一致，样条才不会被拐点处的切线拧歪 */
const count = Math.round(length / step);
const out = [];
for (let i = 0; i < count; i++) {
  const p = curve.getPointAt(i / count);
  out.push([Number(p.x.toFixed(1)), Number(p.z.toFixed(1))]);
}

/* 半径剖面 */
const SAMPLES = 2000;
const WINDOW = 10;
const tangents = [];
for (let i = 0; i < SAMPLES; i++) tangents.push(curve.getTangentAt(i / SAMPLES));
const radii = [];
for (let i = 0; i < SAMPLES; i++) {
  const a = tangents[i];
  const b = tangents[(i + WINDOW) % SAMPLES];
  const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  radii.push(angle > 1e-5 ? (WINDOW / SAMPLES) * length / angle : Infinity);
}

/* 直道区间：连续 30 m 以上半径大于 60 的地方 */
const straights = [];
let cur = null;
for (let i = 0; i < SAMPLES; i++) {
  const straight = radii[i] > 60;
  if (straight && !cur) cur = { from: i / SAMPLES, to: i / SAMPLES, r: radii[i] };
  else if (straight) cur.to = i / SAMPLES;
  else if (cur) { straights.push(cur); cur = null; }
}
if (cur) straights.push(cur);

console.log(`总长 ${length.toFixed(1)} m   控制点 ${out.length} 个（间距 ${step} m）\n`);
console.log('直道区间（可以放加速带 / 断桥）：');
for (const s of straights) {
  const len = (s.to - s.from) * length;
  if (len < 25) continue;
  console.log(`  t ${s.from.toFixed(3)}~${s.to.toFixed(3)}  ${len.toFixed(0)} m`);
}

console.log('\n急弯（R < 45，必须刹车）：');
let prev = -99;
for (let i = 0; i < SAMPLES; i++) {
  if (radii[i] < 45 && i - prev > 25) {
    console.log(`  t ${(i / SAMPLES).toFixed(3)}  半径 ${radii[i].toFixed(0)} m`);
    prev = i;
  }
}

console.log('\n控制点（可粘贴进 maps.js）：');
const flat = out.flatMap(([x, z]) => [x, z]);
const lines = [];
for (let i = 0; i < flat.length; i += 12) {
  lines.push('    ' + flat.slice(i, i + 12).join(', ') + ',');
}
console.log(lines.join('\n'));
