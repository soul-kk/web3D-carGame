/**
 * 桥面生成核对工具（离线跑，不需要浏览器）。
 *
 * 【为什么要有这个】"桥面"在代码里不是一个物体，而是四处生成器拼出来的：
 *   heightAt() 决定高度剖面 → 路面三角带被抬高 → 路肩 / 中线跟着抬
 *   → #buildBridge() 再补腹板、护栏、桥墩、断口碎板。
 * 这几处只要有一处没跟上，肉眼在雾里很难发现，但车开上去就会露馅
 * （起跳角不对、桥墩戳出桥面、断口边没有厚度……）。
 *
 * 这个脚本复刻 track.js 的高度与坡度算法，把"生成出来的桥面"和
 * "物理实际吃到的桥面"分别量一遍，再把两者对比。
 *
 * 用法：
 *   node tools/bridge-deck.mjs            # 熔岩环道
 *   node tools/bridge-deck.mjs grassland  # 没有桥的地图
 */

import * as THREE from '../node_modules/three/build/three.module.js';
import { MAPS, getMapById } from '../src/world/maps.js';
import { CAR, TRACK } from '../src/config.js';

const mapId = process.argv[2] ?? 'volcano';
const map = getMapById(mapId);

const N = TRACK.samples;
const surfaceY = TRACK.surfaceY;

/* ---------------- 复刻 track.js 的几何 ---------------- */

const pairs = Array.isArray(map.controlPoints[0])
  ? map.controlPoints
  : Array.from({ length: Math.floor(map.controlPoints.length / 2) }, (_, i) => [
    map.controlPoints[i * 2], map.controlPoints[i * 2 + 1],
  ]);

const curve = new THREE.CatmullRomCurve3(
  pairs.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  'catmullrom',
  0.5,
);
const totalLength = curve.getLength();
const spacing = totalLength / N;
const halfWidth = (map.width ?? TRACK.width) / 2;
const bridge = map.bridge;

const smoothstep = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** 逐字复刻 track.js 的 heightAt */
function heightAt(t) {
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
}

/** 逐字复刻 track.js 的 surfaceAt（含 null 替换成 y 的行为） */
function surfaceAt(t) {
  const y = heightAt(t);
  if (y === null) return { y: null, slope: 0 };
  const eps = 0.0015;
  const before = heightAt(t - eps);
  const after = heightAt(t + eps);
  const a = before === null ? y : before;
  const b = after === null ? y : after;
  return { y, slope: (b - a) / (2 * eps * totalLength) };
}

/** 物理上"本应"用的单侧差分（后半段为空时用前半段） */
function slopeOneSided(t) {
  const y = heightAt(t);
  if (y === null) return 0;
  const eps = 0.0015;
  const before = heightAt(t - eps);
  const after = heightAt(t + eps);
  if (before === null && after === null) return 0;
  if (before === null) return (after - y) / (eps * totalLength);
  if (after === null) return (y - before) / (eps * totalLength);
  return (after - before) / (2 * eps * totalLength);
}

const m = (t) => +(t * totalLength).toFixed(1);
const out = [];
const log = (s = '') => out.push(s);

log(`===== ${map.name} (${map.id}) =====`);
log(`曲线长度 ${totalLength.toFixed(1)} m | 采样 ${N} | 点距 ${spacing.toFixed(3)} m | 半宽 ${halfWidth} m`);

/* ---------------- 高度剖面 ---------------- */

if (!bridge) {
  log('这张图没有桥。');
} else {
  const b = bridge;
  log('');
  log('-- 桥的五个参数（t → 米）--');
  for (const key of ['from', 'gapFrom', 'gapTo', 'to']) {
    log(`  ${key.padEnd(8)} t=${b[key].toFixed(3)}  s=${m(b[key]).toString().padStart(7)} m`);
  }
  log(`  height   ${b.height} m（桥面离地）`);
  log(`  桥面总长 ${m(b.to) - m(b.from)} m | 断口 ${m(b.gapTo) - m(b.gapFrom)} m`);

  const upLen = m(b.gapFrom) - m(b.from);
  const kickLen = 0.03 * totalLength;
  const downLen = m(b.to) - m(b.gapTo);
  log(`  上桥坡道 ${upLen.toFixed(1)} m（其中起跳唇 ${kickLen.toFixed(1)} m）| 落地坡 ${downLen.toFixed(1)} m`);

  log('');
  log('-- 断口边缘的采样点（路面三角带在这里断开）--');
  const gapStartIndex = b.gapFrom * N;
  const firstGap = Math.ceil(gapStartIndex);
  const lastGround = firstGap - 1;
  const firstAfter = b.gapTo * N;
  const firstLanding = Math.ceil(firstAfter);
  for (const i of [lastGround - 1, lastGround, firstGap, firstGap + 1, firstLanding - 1, firstLanding]) {
    const t = i / N;
    const h = heightAt(t);
    log(`  #${String(i).padStart(4)} t=${t.toFixed(5)} s=${m(t).toString().padStart(7)} m  h=${h === null ? 'NULL' : h.toFixed(3)}`);
  }
  log(`  最后一格地面与第一格落地面之间的水平距离 ${(m(firstLanding / N) - m(lastGround / N)).toFixed(2)} m`);

  log('');
  log('-- 起跳唇坡度：三种算法 --');
  const tLip = lastGround / N;
  /** 窗内单侧：完全避开断口，量的是唇口这一段真实的几何坡度 */
  const analyticSlope = slopeOneSided(tLip - 0.002);
  const twoSidedNearLip = (() => {
    const eps = 0.0002;
    const p = b.gapFrom - 5 * eps;
    return (heightAt(p) - heightAt(p - eps)) / (eps * totalLength);
  })();
  log(`  几何真实斜率（窗内单侧）   ${(analyticSlope * 100).toFixed(1)}%  = ${(Math.atan(analyticSlope) * 180 / Math.PI).toFixed(1)}°`);
  log(`  map-check 用的探针算法      ${(twoSidedNearLip * 100).toFixed(1)}%  = ${(Math.atan(twoSidedNearLip) * 180 / Math.PI).toFixed(1)}°`);
  log(`  游戏 surfaceAt 实际给的值   ${(surfaceAt(tLip).slope * 100).toFixed(1)}%  = ${(Math.atan(surfaceAt(tLip).slope) * 180 / Math.PI).toFixed(1)}°`);
  log(`  同一格单侧差分（应得值）    ${(slopeOneSided(tLip) * 100).toFixed(1)}%  = ${(Math.atan(slopeOneSided(tLip)) * 180 / Math.PI).toFixed(1)}°`);
  log(`  → surfaceAt 在断口前一格把前向差分换成 y，等于把坡度砍掉约 ${(100 - surfaceAt(tLip).slope / slopeOneSided(tLip) * 100).toFixed(0)}%`);

  /* ---------------- 飞跃仿真（复刻 car.js 的竖直段） ---------------- */

  const dt = 1 / 60;

  /**
   * 以恒定水平速度飞过断口，复刻 game.js 的取点方式：
   * 每帧先前进，再用"最近采样点"取 surfaceAt。
   * @returns {{ok:boolean, launchS:number, launchY:number, landS:number|null, landY:number|null, air:number}}
   */
  function jump(v, { oneSided = false, strict = false } = {}) {
    const getSurface = oneSided
      ? (t) => ({ y: heightAt(t), slope: slopeOneSided(t) })
      : surfaceAt;
    let s = 0.06 * totalLength;
    let y = 0;
    let vy = 0;
    let airborne = false;
    let launchS = null;
    let launchY = null;
    let landS = null;
    let landY = null;
    let air = 0;
    let minY = Infinity;

    for (let step = 0; step < 60 * 12; step++) {
      s += v * dt;
      const idx = Math.round(s / spacing) % N;
      const surf = getSurface(idx / N);
      if (surf.y === null) {
        if (!airborne) {
          airborne = true;
          launchS = s;
          launchY = y;
        }
        vy -= CAR.gravity * dt;
        y += vy * dt;
        minY = Math.min(minY, y);
        air += dt;
      } else if (airborne) {
        const prevY = y;
        vy -= CAR.gravity * dt;
        y += vy * dt;
        /* strict：只认"从上方穿过桥面"的落地；否则车会从桥面底下被吸上来 */
        const crossed = !strict || prevY >= surf.y;
        if (y <= surf.y && crossed) {
          y = surf.y;
          airborne = false;
          landS = s;
          landY = y;
          break;
        }
      } else {
        y = surf.y;
        vy = surf.slope * v;
      }
      if (y < CAR.fallLimit) break;
      if (s > (bridge.to + 0.05) * totalLength) break;
    }
    return { ok: landS !== null, launchS, launchY, landS, landY, air, minY };
  }

  /** 二分找"刚好过得去"的速度 */
  function threshold(options) {
    let lo = 5;
    let hi = 120;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (jump(mid, options).ok) hi = mid; else lo = mid;
    }
    return hi;
  }

  log('');
  log('-- 飞跃仿真（恒定水平速度，60 fps，复刻当前代码）--');
  log('  速度   起跳s     起跳高   滞空    最低点   落点s    结果');
  const speeds = [20, 22, 25, 30, 34, 35, 40, 55, 82.5];
  for (const v of speeds) {
    const j = jump(v);
    log(`  ${String(v).padStart(5)} ${j.launchS === null ? '   -  ' : j.launchS.toFixed(1).padStart(7)} ${j.launchY === null ? '  -  ' : j.launchY.toFixed(2).padStart(7)} ${j.air.toFixed(3).padStart(7)}s ${Number.isFinite(j.minY) ? j.minY.toFixed(2).padStart(7) : '    -  '} ${j.landS === null ? '   -  ' : j.landS.toFixed(1).padStart(7)}  ${j.ok ? '过' : '掉'}`);
  }
  const traceSpeed = Number(process.argv[3] ?? 0);
  if (traceSpeed > 0) {
    log('');
    log(`-- ${traceSpeed} m/s 逐帧轨迹（只看断口附近）--`);
    let s = 0.06 * totalLength;
    let y = 0;
    let vy = 0;
    let airborne = false;
    for (let step = 0; step < 60 * 12; step++) {
      s += traceSpeed * dt;
      const idx = Math.round(s / spacing) % N;
      const surf = surfaceAt(idx / N);
      let note = '';
      if (surf.y === null) {
        if (!airborne) { airborne = true; note = '← 离地'; }
        vy -= CAR.gravity * dt;
        y += vy * dt;
      } else if (airborne) {
        vy -= CAR.gravity * dt;
        y += vy * dt;
        if (y <= surf.y) {
          note = `← 贴回桥面（从 ${y.toFixed(2)} 吸到 ${surf.y.toFixed(2)}）`;
          y = surf.y;
          airborne = false;
        }
      } else {
        y = surf.y;
        vy = surf.slope * traceSpeed;
      }
      if (s > (b.gapFrom - 0.02) * totalLength && s < (b.gapTo + 0.01) * totalLength) {
        log(`  s=${s.toFixed(1).padStart(6)} idx=${String(idx).padStart(4)} 路面=${surf.y === null ? 'NULL' : surf.y.toFixed(2)} 车高=${y.toFixed(2).padStart(6)} vy=${vy.toFixed(2).padStart(6)} ${note}`);
      }
      if (s > (b.gapTo + 0.02) * totalLength) break;
    }
  }

  const th = threshold({});
  const thSlope = threshold({ oneSided: true });
  const thStrict = threshold({ strict: true });
  const thBoth = threshold({ oneSided: true, strict: true });
  log(`  最低过关速度（当前代码）        ≈ ${th.toFixed(1)} m/s = 极速的 ${(th / CAR.maxSpeed * 100).toFixed(0)}%（靠"从桥面底下吸上来"过关）`);
  log(`  只修坡度（单侧差分）            ≈ ${thSlope.toFixed(1)} m/s = ${(thSlope / CAR.maxSpeed * 100).toFixed(0)}%`);
  log(`  只修落地判定（不许从下面吸）    ≈ ${thStrict.toFixed(1)} m/s = ${(thStrict / CAR.maxSpeed * 100).toFixed(0)}%`);
  log(`  两处都修                        ≈ ${thBoth.toFixed(1)} m/s = ${(thBoth / CAR.maxSpeed * 100).toFixed(0)}%`);
  const at34 = jump(34, { oneSided: true, strict: true });
  if (at34.ok) {
    const range = at34.landS - at34.launchS;
    log(`  两处都修后，34 m/s 的滞空距离 ${range.toFixed(1)} m → 想让门槛回到 34 m/s，断口要加宽到约 ${range.toFixed(1)} m`);
  }
  log(`  map-check 的理论值              ≈ 30.7 m/s（假定了完整唇口坡度，但没有落地判定）`);

  /* ---------------- 断口前后各零件的生成数量 ---------------- */

  log('');
  log('-- #buildBridge 生成出来的零件 --');

  const edge = halfWidth + TRACK.curbWidth;

  let posts = 0;
  let postMats = 0;
  let piers = 0;
  let caps = 0;
  const pierRows = [];
  for (let t = b.from; t <= b.to; t += 0.008) {
    const h = heightAt(t);
    if (h === null || h < 0.6) continue;
    posts += 2;
    postMats += 2;
  }
  for (let t = b.from; t <= b.to; t += 0.012) {
    if (t > b.gapFrom - 0.012 && t < b.gapTo + 0.012) continue;
    const h = heightAt(t);
    if (h === null || h < 1.2) continue;
    piers += 2;
    caps += 1;
    pierRows.push(t);
  }
  log(`  桥墩 ${piers} 根（${pierRows.length} 排）| 盖梁 ${caps} 根`);
  // 桥墩顶用的是 heightAt(t)，桥面是相邻采样点的线性插值 —— 两者差多少？
  let maxPierDiff = 0;
  for (const t of pierRows) {
    const i = Math.floor(t * N);
    const f = t * N - i;
    const deck = heightAt(i / N) * (1 - f) + heightAt((i + 1) / N) * f;
    maxPierDiff = Math.max(maxPierDiff, Math.abs(heightAt(t) - deck));
  }
  log(`  桥墩顶面与插值桥面的最大高差 ${(maxPierDiff * 100).toFixed(1)} cm → 顶面与桥面共面，${piers} 处 z-fighting`);
  log(`  护栏立柱 ${posts} 根 → ${postMats} 个独立材质（每根都 toon() 新建）`);
  log(`  腹板 2 | 护栏 2 | 断口警戒条 2 | 断口发光条 2 | 碎板 10`);

  /* ---------------- 中线虚线（InstancedMesh） ---------------- */

  const dashParams = [];
  for (let d = 12; d < totalLength - 12; d += 9) dashParams.push(d / totalLength);
  let skipped = 0;
  for (const t of dashParams) if (heightAt(t) === null) skipped += 1;
  log(`  中线虚线实例 ${dashParams.length} 个，其中 ${skipped} 个落在断口 → 矩阵留在单位阵（原点 (0,0,0) 会多出 ${skipped} 块虚线）`);

  /* ---------------- 断面尺寸 ---------------- */

  log('');
  log('-- 桥面断面（米）--');
  log(`  路面半宽 ${halfWidth} + 路肩 ${TRACK.curbWidth} → 外沿 ${edge}`);
  log(`  腹板厚 1.8（桥面顶 → 底 ${(surfaceY).toFixed(2)} → ${(surfaceY - 1.8).toFixed(2)}）`);
  log(`  护栏高 1.5（${(surfaceY + 0).toFixed(2)} → ${(surfaceY + 1.5).toFixed(2)}），立柱高 1.6`);
  log(`  桥墩 3.2×3.2，盖梁 1.1 高，中心在桥面下 1.9 m`);
  log(`  【断口没有端面】路面是零厚度三角带，腹板只是两侧竖片，塌口处没有"板厚的切口"`);

  const pierTop = pierRows.length
    ? heightAt(pierRows[0]) + surfaceY
    : null;
  if (pierTop !== null) {
    log(`  桥墩顶 y=${pierTop.toFixed(2)}，腹板底 y=${(pierTop - 1.8).toFixed(2)} → 桥墩穿过腹板 1.8 m 后才到桥面`);
  }
}

/* ---------------- 输出 ---------------- */

const text = out.join('\n');
console.log(text);
