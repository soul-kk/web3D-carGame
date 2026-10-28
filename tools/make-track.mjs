/**
 * 赛道生成器：把"直道 / 圆弧"这样的节奏描述，编译成 `maps.js` 里用的控制点。
 *
 * 【为什么不用手摆控制点】手摆控制点只能"看着像"某个半径，
 * 实际半径要靠曲线算出来才知道 —— 而半径决定了弯要不要刹车：
 * 按 car.js 的转向模型，车在极速 55 m/s 时最小转弯半径是 41 m，
 * 也就是说半径大于 ~45 m 的弯全都能全油门过。
 * 想让一段路"必须减速"，就得精确地排出半径 20~35 m 的弯。
 *
 * 【怎么用】先在这里写一段赛道，跑到终端里看输出的控制点和 t 分段表，
 * 满意之后把控制点抄进 src/world/maps.js。
 *
 * 用法：node tools/make-track.mjs <脚本文件>
 *   脚本文件导出一个数组，每一项是：
 *     { straight: 120 }                       直道 120 m
 *     { arc: { radius: 60, deg: 90, dir: 'left' } }   圆弧
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { CAR } from '../src/config.js';

/** 车在速度 v 时能达到的最小转弯半径（复刻 car.js 的转向模型） */
function minRadiusAt(v) {
  const turnPower = CAR.turnRate * (1 - 0.35 * Math.min(Math.abs(v) / CAR.maxSpeed, 1));
  return v / turnPower;
}

/** 某个半径下能全速通过的最大速度（解 v/ω(v) = r） */
function maxSpeedInCorner(r) {
  // v = r · 2.05 · (1 - 0.35 v / 55)  →  v (1 + 0.35·r·2.05/55) = r·2.05
  const v = (r * CAR.turnRate) / (1 + (0.35 * CAR.turnRate * r) / CAR.maxSpeed);
  return Math.min(v, CAR.maxSpeed);
}

const RAD = Math.PI / 180;

/**
 * 把段式描述编译成控制点。
 * @param {Array} segments
 * @returns {{points:Array<[number,number]>, rows:Array, total:number}}
 */
export function buildTrack(segments, { start = [0, 0], heading = 0, startAt = 0, step = 6 } = {}) {
  let x = start[0];
  let z = start[1];
  let dir = heading;              // 朝向角：0 = +x
  const points = [[x, z]];
  const rows = [];
  let travelled = 0;
  let total = 0;

  for (const seg of segments) {
    if (seg.straight !== undefined) {
      const len = seg.straight;
      const steps = Math.max(1, Math.round(len / 8));   // 内部先密采样
      for (let i = 1; i <= steps; i++) {
        const d = (len * i) / steps;
        points.push([x + Math.cos(dir) * d, z + Math.sin(dir) * d]);
      }
      x += Math.cos(dir) * len;
      z += Math.sin(dir) * len;
      travelled += len;
      total += len;
      rows.push({ type: '直道', len, from: travelled - len, to: travelled, dir });
    } else if (seg.arc) {
      const { radius, deg, dir: turn } = seg.arc;
      const sign = turn === 'right' ? -1 : 1;
      const arcLen = (Math.abs(deg) * RAD) * radius;
      // 采样步长：半径越小步长越细，否则圆弧会被"切"得偏大
      const arcStep = 6;
      const steps = Math.max(2, Math.round(Math.abs(deg) / arcStep));
      for (let i = 1; i <= steps; i++) {
        const a = (deg * i) / steps;
        // 圆心在前进方向的左侧（left）或右侧（right）
        const cx = x + Math.cos(dir + sign * Math.PI / 2) * radius;
        const cz = z + Math.sin(dir + sign * Math.PI / 2) * radius;
        const startAngle = Math.atan2(z - cz, x - cx);
        const p = new THREE.Vector3(
          cx + Math.cos(startAngle + sign * a * RAD) * radius,
          0,
          cz + Math.sin(startAngle + sign * a * RAD) * radius,
        );
        points.push([p.x, p.z]);
      }
      const last = points[points.length - 1];
      x = last[0];
      z = last[1];
      dir += sign * deg * RAD;
      travelled += arcLen;
      total += arcLen;
      rows.push({
        type: `弯 ${turn === 'right' ? '右' : '左'} ${Math.abs(deg)}°`,
        radius,
        len: arcLen,
        from: travelled - arcLen,
        to: travelled,
        maxSpeed: maxSpeedInCorner(radius),
      });
    }
  }

  // 归一化成 0~1 的 t
  for (const row of rows) {
    row.tFrom = (startAt + row.from) / total;
    row.tTo = (startAt + row.to) / total;
  }

  // 原始折线用于算闭合误差，重采样后的点才是最终控制点
  return { points: resampleByArcLength(points, step), rawPoints: points, rows, total };
}

/**
 * 沿折线按弧长均匀重采样（闭合：末尾接回首）。
 *
 * 【为什么必须这一步】CatmullRom 在每个点上用"前后邻居连线"当切线。
 * 如果相邻两点的间距差很多（直道每 25 m 一个点、弯里每 3 m 一个点），
 * 拐点处的切线会被带偏，样条就在接缝处拧出一个小半径的死弯 ——
 * 实测过：设计 R=25 的发夹弯会被拧成 R=5，车根本过不去。
 * 均匀采样之后切线处处一致，曲线才真正贴合设计。
 *
 * @param {Array<[number,number]>} polyline
 * @param {number} step 目标间距（米）
 */
export function resampleByArcLength(polyline, step) {
  const closed = [...polyline, polyline[0]];
  const lengths = [0];
  for (let i = 1; i < closed.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(
      closed[i][0] - closed[i - 1][0],
      closed[i][1] - closed[i - 1][1],
    ));
  }
  const total = lengths[lengths.length - 1];
  const count = Math.max(8, Math.round(total / step));
  const out = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / count;
    while (seg < lengths.length - 2 && lengths[seg + 1] < target) seg++;
    const span = lengths[seg + 1] - lengths[seg] || 1;
    const f = (target - lengths[seg]) / span;
    out.push([
      closed[seg][0] + (closed[seg + 1][0] - closed[seg][0]) * f,
      closed[seg][1] + (closed[seg + 1][1] - closed[seg][1]) * f,
    ]);
  }
  return out;
}

/**
 * 高斯消元解线性方程组 A x = b（部分主元）。
 * @param {number[][]} A
 * @param {number[]} b
 * @returns {number[]|null} 解；矩阵奇异时返回 null
 */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // 选绝对值最大的主元
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * 自动闭合：把两段直道的长度当未知数，解出"终点回到起点"的那组长度。
 *
 * 【为什么需要它】闭合赛道要求两件事同时成立：终点回到起点（位置闭合），
 * 终点朝向和起点一致（切线闭合）。朝向靠"弯的总角度 = ±360°"保证，
 * 位置则要靠长度凑 —— 手调很烦，这个牛顿迭代几轮就解出来了。
 *
 * @param {Array} segments 段式描述（会被就地修改）
 * @param {[number, number]} free 段下标：这两段的 straight 长度是未知数
 */
export function autoClose(segments, free) {
  const evaluate = (segs) => {
    // 用原始折线算闭合误差：重采样之后首尾必然差一个 step，那不是"没闭合"
    const { rawPoints } = buildTrack(segs, {});
    const first = rawPoints[0];
    const last = rawPoints[rawPoints.length - 1];
    return { ex: last[0] - first[0], ez: last[1] - first[1] };
  };

  const straightIndices = segments
    .map((seg, i) => (seg.straight !== undefined ? i : -1))
    .filter((i) => i >= 0);
  if (straightIndices.length < 2) throw new Error('autoClose: 至少要两段直道');

  // 未知数 = 所有直道（或者指定的那些），用最小二乘一起调
  const vars = free ?? straightIndices;
  const MIN_LEN = 5;
  const MAX_LEN = 420;

  for (let iter = 0; iter < 400; iter++) {
    const base = evaluate(segments);
    const err = Math.hypot(base.ex, base.ez);
    if (err < 0.05) break;

    // 数值雅可比 J（2 × n）
    const J = [[], []];
    for (const k of vars) {
      const backup = segments[k].straight;
      segments[k].straight = backup + 1;
      const bumped = evaluate(segments);
      segments[k].straight = backup;
      J[0].push(bumped.ex - base.ex);
      J[1].push(bumped.ez - base.ez);
    }

    // 阻尼最小二乘：min ||Jδ + e||² + λ||δ||²
    // 【为什么要正则项】不加的话求解器会把长度全堆到某两根直道上，
    // 节奏（哪段是长直道、哪段是紧挨着的两个弯）就被破坏了。
    // 加上 λ||δ||² 之后，"改动最小的解"优先，设计意图得以保留。
    const lambda = 0.35;
    const n = vars.length;
    // A = JᵀJ + λI, b = -Jᵀe
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        A[i][j] = J[0][i] * J[0][j] + J[1][i] * J[1][j];
      }
      A[i][i] += lambda;
      b[i] = -(J[0][i] * base.ex + J[1][i] * base.ez);
    }
    const delta = solveLinear(A, b);
    if (!delta) break;

    vars.forEach((k, i) => {
      segments[k].straight = Math.min(MAX_LEN, Math.max(MIN_LEN, segments[k].straight + delta[i]));
    });
  }

  const final = evaluate(segments);
  console.log(
    `（自动闭合：${final.err !== undefined ? '' : ''}` +
    `残差 ${Math.hypot(final.ex, final.ez).toFixed(2)} m，自由直道 ${vars.map((v) => v).join('、')}）`,
  );
  return segments;
}

/** 打印一张表：每段的类型、长度、起止 t、弯里的最高速度 */
export function printRows(rows, total) {
  console.log(`总长 ${total.toFixed(1)} m\n`);
  console.log('  #  类型            长度   t 起      t 止      弯内最高速');
  rows.forEach((row, i) => {
    const speed = row.maxSpeed !== undefined ? `${row.maxSpeed.toFixed(1)} m/s` : '—';
    const radius = row.radius !== undefined ? ` R=${row.radius}` : '';
    console.log(
      `  ${String(i).padStart(2)}  ${(row.type + radius).padEnd(14)} ${String(Math.round(row.len)).padStart(4)}m  ` +
      `${row.tFrom.toFixed(4)}   ${row.tTo.toFixed(4)}   ${speed}`,
    );
  });
}

/**
 * 输出可以直接抄进 config.js / maps.js 的控制点数组（扁平格式）。
 *
 * 【为什么是扁平格式】一台 1000 m 的赛道有 100 个点，
 * 写成 [[x, z], ...] 要 100 行，扁平成 [x, z, x, z, ...] 同样的数据只占 10 行。
 */
export function formatPoints(points) {
  const flat = points.flatMap(([x, z]) => [Number(x.toFixed(1)), Number(z.toFixed(1))]);
  const lines = [];
  for (let i = 0; i < flat.length; i += 12) {
    lines.push('    ' + flat.slice(i, i + 12).join(', ') + ',');
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------
// 直接执行时：加载脚本并打印结果
// ------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('make-track.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node tools/make-track.mjs <脚本文件>');
    process.exit(1);
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const module = await import(pathToFileURL(resolve(file)).href);
  const segments = module.default ?? module.segments;
  const options = module.options ?? {};

  if (module.close !== false) {
    autoClose(segments, module.close === true ? null : module.close);
    console.log('（已按 close 指定的两个直道自动闭合）');
  }

  const { points, rows, total } = buildTrack(segments, options);

  if (options.center) {
    // 把赛道挪到原点附近，地图里的一切（树、远山、装饰）都围着它转
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    for (const p of points) { p[0] -= cx; p[1] -= cz; }
  }

  // 切线闭合：所有弯的角度加起来必须是 ±360°
  let turn = 0;
  for (const seg of segments) {
    if (seg.arc) turn += seg.arc.deg * (seg.arc.dir === 'right' ? -1 : 1);
  }
  // 位置闭合：终点和起点的距离（用原始折线算）
  const raw = buildTrack(segments, options).rawPoints;
  const gap = Math.hypot(raw[raw.length - 1][0] - raw[0][0], raw[raw.length - 1][1] - raw[0][1]);

  printRows(rows, total);
  console.log(`\n转向总和 ${turn}°（应为 ±360） | 首尾距离 ${gap.toFixed(2)} m（应为 0）`);
  console.log('\n控制点：');
  console.log(formatPoints(points));
  console.log(`\n极速 ${CAR.maxSpeed} m/s 时最小转弯半径 ${minRadiusAt(CAR.maxSpeed).toFixed(1)} m`);
  console.log('（半径大于这个值的弯，全油门就能过，不构成节奏）');
}
