/**
 * 地图几何核对工具（离线跑，不需要浏览器）。
 *
 * 【为什么要有这个】地图的"手感"全藏在几何里：弯有多急、直道有多长、
 * 断口有多宽、加速带压在弯心还是出弯口。这些用肉眼看图看不出来，
 * 只能按真实曲线算。所以这个脚本复刻 `world/track.js` 里的曲线和高度算法，
 * 把每张图的关键数字算出来，顺便检查金币/加速带摆得对不对。
 *
 * 用法：
 *   node tools/map-check.mjs            # 全部地图
 *   node tools/map-check.mjs volcano    # 只看某张图
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { MAPS } from '../src/world/maps.js';
import { CAR, PROPS, TRACK } from '../src/config.js';

const GRAVITY = CAR.gravity;

/** 复刻 track.js 的中心线（控制点支持嵌套和扁平两种写法） */
function buildCurve(controlPoints) {
  const pairs = Array.isArray(controlPoints[0])
    ? controlPoints
    : Array.from({ length: Math.floor(controlPoints.length / 2) }, (_, i) => [
      controlPoints[i * 2], controlPoints[i * 2 + 1],
    ]);
  return new THREE.CatmullRomCurve3(
    pairs.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.5,
  );
}

/** 复刻 track.js 的 heightAt（断桥） */
function makeHeightAt(bridge, totalLength) {
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

/**
 * 曲率分析：把整条曲线切成一段段，看每段是"直道 / 高速弯 / 普通弯 / 发夹弯"。
 * @returns {{segments:Array, samples:Array}}
 */
function analyzeCurvature(curve, count = 1200) {
  const totalLength = curve.getLength();
  const dt = 1 / count;
  const radii = [];
  // 【为什么要开窗】逐点算曲率会被采样噪声放大：相邻两点的切线只差 0.03 rad，
  // 数值误差会让半径在 26 m 和 45 m 之间乱跳。这里用"一段窗口内的总转角"
  // 来算半径，得到的才是这条弯真实的半径。
  const WINDOW = 12;   // 约 12 个采样点 ≈ 10~12 m
  const tangents = [];
  for (let i = 0; i < count; i++) {
    tangents.push(curve.getTangentAt(i / count));
  }
  for (let i = 0; i < count; i++) {
    const a = tangents[i];
    const b = tangents[(i + WINDOW) % count];
    const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    const arc = totalLength * dt * WINDOW;
    radii.push(angle > 1e-4 ? arc / angle : Infinity);
  }

  /**
   * 半径阈值：弯越急，半径越小。
   *
   * 【阈值为什么这样定】按 car.js 的转向模型，车在速度 v 时能达到的最小转弯半径是
   *   r = v / ω，ω = 2.05 × (1 - 0.35 × v/55)
   * 于是 55 m/s（极速）时最小半径 41 m —— 也就是说
   * **半径大于 ~45 m 的弯都能全油门过**，它们不构成"节奏"。
   * 真正让人必须减速的弯，半径得在 20~40 m 这一档。
   */
  const classify = (r) => {
    if (r === Infinity) return 'straight';
    if (r >= 300) return 'straight';
    if (r >= 150) return 'sweeper';
    if (r >= 60) return 'corner';
    if (r >= 30) return 'slow';
    return 'hairpin';
  };

  const segments = [];
  let current = null;
  for (let i = 0; i < count; i++) {
    const kind = classify(radii[i]);
    if (!current || current.kind !== kind) {
      current = { kind, startIndex: i, endIndex: i, minRadius: radii[i] };
      segments.push(current);
    } else {
      current.endIndex = i;
      current.minRadius = Math.min(current.minRadius, radii[i]);
    }
  }
  for (const seg of segments) {
    seg.from = seg.startIndex / count;
    seg.to = (seg.endIndex + 1) / count;
    seg.length = (seg.endIndex - seg.startIndex + 1) * totalLength / count;
    seg.minRadius = Number.isFinite(seg.minRadius) ? Math.round(seg.minRadius) : Infinity;
  }
  // 合并太短的碎片段（噪声），但保留它的类型信息
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === seg.kind) {
      prev.to = seg.to;
      prev.length += seg.length;
      prev.minRadius = Math.min(prev.minRadius, seg.minRadius);
    } else {
      merged.push({ ...seg });
    }
  }
  return { segments: merged, radii, totalLength };
}

/** 找出"卡顿点"：半径小到车几乎转不过来的地方 */
function findKinks(radii, count, totalLength) {
  const kinks = [];
  for (let i = 0; i < count; i++) {
    if (radii[i] < 28) {
      const prev = kinks[kinks.length - 1];
      if (prev && i - prev.endIndex <= 3) { prev.endIndex = i; prev.min = Math.min(prev.min, radii[i]); continue; }
      kinks.push({ startIndex: i, endIndex: i, min: radii[i] });
    }
  }
  return kinks.map((k) => ({
    from: k.startIndex / count,
    to: (k.endIndex + 1) / count,
    radius: Math.round(k.min),
    length: Math.round(((k.endIndex - k.startIndex + 1) * totalLength) / count),
  }));
}

/**
 * 断桥飞跃计算：给定断口宽度，算"至少要多快才飞得过去"。
 * @returns {{required:number, gapMeters:number, lipHeight:number, angleDeg:number}}
 */
function analyzeJump(curve, bridge, heightAt, totalLength) {
  const gapMeters = (bridge.gapTo - bridge.gapFrom) * totalLength;
  const lipT = bridge.gapFrom - 1e-4;
  const lipHeight = heightAt(lipT);

  // 唇口坡度：用高度函数的数值导数。
  // 【坑】差分必须取在断口"内侧"—— gapFrom 处高度是 null，
  // 拿它参与减法会算出 -88° 这种荒谬角度（null 在算术里当 0）。
  const eps = 2e-4;
  const probe = bridge.gapFrom - 5 * eps;
  const slope = (heightAt(probe) - heightAt(probe - eps)) / (eps * totalLength);
  const angle = Math.atan(slope);

  // 抛体：起点 (0, lipHeight)，目标是对面桥面高度 bridge.height
  const target = bridge.height;
  const rise = lipHeight - target;
  const vTan = Math.tan(angle);
  // 水平飞行距离 = v * cosθ * t；竖直：rise + v*sinθ*t - g t²/2 = 0
  // 令 k = v*sinθ，则 t = (k + sqrt(k² + 2g*rise)) / g
  const requiredSpeed = (gapMeters) => {
    let lo = 5, hi = 200;
    for (let i = 0; i < 60; i++) {
      const v = (lo + hi) / 2;
      const k = v * vTan;
      const disc = k * k + 2 * GRAVITY * rise;
      const t = (k + Math.sqrt(Math.max(0, disc))) / GRAVITY;
      const range = v * Math.cos(angle) * t;
      if (range < gapMeters) lo = v; else hi = v;
    }
    return (lo + hi) / 2;
  };

  return {
    gapMeters,
    lipHeight,
    angleDeg: (angle * 180) / Math.PI,
    required: requiredSpeed(gapMeters),
    maxSpeed: CAR.maxSpeed,
    nitroSpeed: CAR.maxSpeed * CAR.boostFactor,
    rampMeters: (bridge.gapFrom - bridge.from) * totalLength,
    kickMeters: 0.03 * totalLength,
  };
}

/** 检查一张图的道具摆法 */
function analyzeProps(map, curve, heightAt, totalLength) {
  const halfWidth = (map.width ?? TRACK.width) / 2;
  const issues = [];
  const coins = [];
  const boosts = [];

  const plan = map.props ?? {};
  const runs = plan.coins?.runs ?? [];
  const count = plan.coins?.count ?? PROPS.coinsPerRun;
  const spacing = plan.coins?.spacing ?? PROPS.coinSpacing;

  for (const run of runs) {
    const offset = run.offset ?? 0;
    if (Math.abs(offset) > halfWidth - 2.5) {
      issues.push(`金币串 t=${run.t} 偏移 ${offset}m 太靠边（路面半宽 ${halfWidth}m）`);
    }
    for (let k = 0; k < count; k++) {
      const t = (run.t + k * (spacing / totalLength)) % 1;
      const y = heightAt(t);
      if (y === null) issues.push(`金币落在断口上 t=${t.toFixed(4)}`);
      coins.push({ t, offset });
    }
  }

  for (const spec of plan.boosts ?? []) {
    const offset = spec.offset ?? 0;
    if (Math.abs(offset) > halfWidth - 2.5) {
      issues.push(`加速带 t=${spec.t} 偏移 ${offset}m 太靠边（路面半宽 ${halfWidth}m）`);
    }
    const y = heightAt(spec.t);
    if (y === null) issues.push(`加速带落在断口上 t=${spec.t}`);
    boosts.push({ t: spec.t, offset });
  }

  // 金币串内部自相重叠检查
  const step = spacing / totalLength;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      let d = Math.abs(runs[i].t - runs[j].t);
      d = Math.min(d, 1 - d);
      if (d < step * count) {
        issues.push(`金币串 t=${runs[i].t} 与 t=${runs[j].t} 距离太近（${(d * totalLength).toFixed(1)}m < ${(step * count * totalLength).toFixed(1)}m）`);
      }
    }
  }

  return { coins, boosts, issues, count: coins.length };
}

/** 报告 */
function report(map) {
  const curve = buildCurve(map.controlPoints);
  const totalLength = curve.getLength();
  const heightAt = makeHeightAt(map.bridge, totalLength);
  const { segments, radii } = analyzeCurvature(curve);
  const kinks = findKinks(radii, 1200, totalLength);
  const props = analyzeProps(map, curve, heightAt, totalLength);

  console.log(`\n===== ${map.name} (${map.id}) =====`);
  console.log(`长度 ${totalLength.toFixed(1)} m | 路宽 ${map.width ?? TRACK.width} m | 控制点 ${map.controlPoints.length} 个`);
  console.log(`金币 ${props.count} 枚 | 加速带 ${props.boosts.length} 条`);

  console.log('\n-- 弯道节奏 --');
  for (const seg of segments) {
    if (seg.length < 12) continue;   // 太短的段不展示
    const radius = seg.minRadius === Infinity ? '∞' : `${seg.minRadius}m`;
    console.log(
      `  t ${seg.from.toFixed(3)}~${seg.to.toFixed(3)}  ${String(Math.round(seg.length)).padStart(4)}m  ` +
      `${seg.kind.padEnd(8)} 最小半径 ${radius}`,
    );
  }

  // 控制点 → 弧长参数 t + 该处曲率半径：定位"是哪个点把路拧了"
  const pairs = Array.isArray(map.controlPoints[0])
    ? map.controlPoints
    : Array.from({ length: Math.floor(map.controlPoints.length / 2) }, (_, i) => [
      map.controlPoints[i * 2], map.controlPoints[i * 2 + 1],
    ]);
  const vertexRows = [];
  for (let i = 0; i < pairs.length; i++) {
    const u = i / map.controlPoints.length;
    const t = curve.getUtoTmapping(u);
    const idx = Math.min(1199, Math.floor(t * 1200));
    const radius = radii[idx];
    vertexRows.push({
      i,
      t,
      radius: Number.isFinite(radius) ? Math.round(radius) : Infinity,
      at: pairs[i] ?? [0, 0],
    });
  }

  if (kinks.length) {
    console.log('\n-- 卡顿点（半径 < 45m，车几乎转不过来）--');
    for (const kink of kinks) {
      console.log(`  t ${kink.from.toFixed(3)}~${kink.to.toFixed(3)}  ${kink.length}m  半径 ${kink.radius}m`);
    }
  }

  if (map.bridge) {
    const jump = analyzeJump(curve, map.bridge, heightAt, totalLength);
    console.log('\n-- 断桥 --');
    console.log(`  断口 ${jump.gapMeters.toFixed(1)} m | 唇口高 ${jump.lipHeight.toFixed(2)} m | 起跳角 ${jump.angleDeg.toFixed(1)}°`);
    console.log(`  上桥坡道 ${jump.rampMeters.toFixed(0)} m | 起跳唇段 ${jump.kickMeters.toFixed(0)} m`);
    console.log(`  最低过关速度 ≈ ${jump.required.toFixed(1)} m/s （极速 ${jump.maxSpeed}，氮气 ${jump.nitroSpeed.toFixed(0)}）`);
    console.log(`  → 门槛占极速 ${((jump.required / jump.maxSpeed) * 100).toFixed(0)}%`);
  }

  console.log('\n-- 控制点 --');
  for (const row of vertexRows) {
    const radius = row.radius === Infinity ? '∞' : `${row.radius}m`;
    console.log(`  #${String(row.i).padStart(2)}  t=${row.t.toFixed(3)}  半径 ${String(radius).padStart(6)}  [${row.at.join(', ')}]`);
  }

  if (props.issues.length) {
    console.log('\n-- 问题 --');
    for (const issue of props.issues) console.log(`  ✗ ${issue}`);
  } else {
    console.log('\n-- 道具检查 -- 无问题');
  }

  return { map, totalLength, segments, props };
}

const wanted = process.argv[2];
const jsonArg = process.argv[3];

if (wanted === '--json') {
  // 调试用：node tools/map-check.mjs --json candidate.json
  // JSON 里放 [{ id, name, width, controlPoints, bridge?, props? }]
  const { readFileSync } = await import('node:fs');
  const candidates = JSON.parse(readFileSync(jsonArg, 'utf8'));
  for (const map of candidates) report(map);
} else {
  for (const map of MAPS) {
    if (wanted && map.id !== wanted) continue;
    report(map);
  }
}
