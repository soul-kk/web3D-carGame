import * as THREE from 'three';
import { CAR } from '../config.js';
import { createCarModel } from './car.js';
import { readJson, writeJson, removeKey } from '../core/storage.js';

/**
 * 幽灵车：把"最好的一整场"录下来，下一局用一辆半透明赛车重放。
 *
 * 【为什么这是最划算的玩法】计时赛本身没有对手，跑完就没有理由再跑。
 * 幽灵车把"对手"变成上一局的自己，而且几乎不用写新的游戏规则：
 *
 *   1. 绿灯亮起后每帧记录玩家位置和朝向（GhostRecorder）
 *   2. 刷新最佳总用时的那一局，把整场的采样存进 localStorage
 *   3. 下一局读出采样，按时间插值播放（GhostPlayer）
 *
 * 【为什么录"整场"而不是"最佳单圈"】录单圈的话，录到的一定是个**飞行圈**
 * （第 2/3 圈，过起点线时已经满速 55 m/s），而玩家第 1 圈是静止起步 ——
 * 两边时间轴都从 0 开始，幽灵车一开场就领先十几个车位，这种对比没有意义。
 * 录整场就不一样了：幽灵车的第 0 帧也是"停在起点线上、速度 0"，
 * 它和你跑的是同一个赛程（静止起步 + 3 圈），从绿灯到终点线全程都可比。
 *
 * 【为什么要定点化（乘 100 再取整）】localStorage 只能存字符串，
 * 一场 30Hz 的比赛大约有 1300 帧 × 3 个数字。如果直接存 JSON 浮点数，
 * 一个数字要 17 个字符；乘 100 取整后只剩 4~5 个字符，体积直接砍掉一半多，
 * 而且 0.01 的精度对幽灵车来说完全看不出来。
 */

/** localStorage 里存历史最佳的 key（storage.js 会再加统一前缀） */
const BEST_KEY = 'best';
/**
 * 记录格式版本。
 * v1 存的是"最佳单圈"，v2 改成"整场"（ghost 里从 lapTime 变成 totalTime），
 * 把版本号 +1 之后，老数据会被 loadBest 直接忽略，而不是读出一个跑不动的幽灵车。
 */
const RECORD_VERSION = 2;

/** 采样频率。30Hz 够顺滑，数据量只有 60Hz 的一半 */
export const GHOST_HZ = 30;
/** 一场超过这么久就不存（开着不动时别把存储撑爆） */
const MAX_GHOST_SECONDS = 200;

const POS_SCALE = 100;
const HEADING_SCALE = 1000;

/* ================================================================== */
/* 存档                                                                */
/* ================================================================== */

/**
 * 读取历史最佳。
 * 结构：{ version, bestLapTime, bestTotalTime, ghost: { hz, totalTime, data } }
 * @returns {object|null} 没有存档 / 格式不对时返回 null
 */
export function loadBest() {
  const record = readJson(BEST_KEY);
  if (!record || record.version !== RECORD_VERSION) return null;
  if (record.ghost && !Array.isArray(record.ghost.data)) return null;
  return record;
}

/**
 * 把若干字段合并进历史最佳并写回。
 * 用"合并"而不是"整体覆盖"，这样刷新单圈记录时不会把总时间记录冲掉。
 * @param {object} patch
 * @returns {object} 合并后的完整记录
 */
export function mergeBest(patch) {
  const record = { version: RECORD_VERSION, ...(loadBest() ?? {}), ...patch };
  writeJson(BEST_KEY, record);
  return record;
}

/** 清空历史最佳（连同幽灵车数据） */
export function clearBest() {
  removeKey(BEST_KEY);
}

/* ================================================================== */
/* 录制                                                                */
/* ================================================================== */

/**
 * 把一整场的采样打包成可存储对象。
 * @param {number[]} data 扁平数组 [x, z, heading, x, z, heading, ...]
 * @param {number} totalTime 这一场的总用时（用于显示出"幽灵比你快/慢多少"）
 * @returns {{hz:number, totalTime:number, data:number[]}|null} 数据太少 / 太长时返回 null
 */
export function packGhost(data, totalTime) {
  const frames = data.length / 3;
  if (frames < 2) return null;
  if (frames / GHOST_HZ > MAX_GHOST_SECONDS) return null;
  return { hz: GHOST_HZ, totalTime, data };
}

/**
 * 录制器：每帧喂给它赛车，它按固定间隔存下 (x, z, heading)，
 * 从绿灯一直记到终点线 —— 整场比赛一条时间轴。
 *
 * 【为什么按固定间隔而不是每帧】帧率在不同机器上不一样，
 * 按时间轴采样，幽灵在谁的电脑上跑出来的速度都一致。
 */
export class GhostRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    /** 扁平数组 [x, z, heading, ...]，从头到尾就是这一整场 */
    this.data = [];
    /** 距离下一次采样的剩余时间 */
    this.acc = 0;
  }

  /** 每帧调用（只在比赛中） */
  record(dt, car) {
    this.acc += dt;
    const interval = 1 / GHOST_HZ;
    if (this.acc < interval) return;
    this.acc -= interval;

    this.data.push(
      Math.round(car.position.x * POS_SCALE),
      Math.round(car.position.z * POS_SCALE),
      Math.round(car.heading * HEADING_SCALE),
    );
  }
}

/* ================================================================== */
/* 回放                                                                */
/* ================================================================== */

/**
 * 回放器：一辆半透明的赛车，每帧按录好的时间轴定位。
 *
 * 【插值】采样只有 30Hz，直接"每 1/30 秒跳一格"会一格一格地卡。
 * 所以按时间算出浮点下标，在相邻两帧之间插值：位置线性插值，
 * 朝向走最短弧（跨过 ±π 时才不会突然转一整圈）。
 */
export class GhostPlayer {
  /**
   * @param {THREE.Scene} scene
   * @param {{hz:number, totalTime:number, data:number[]}} record
   */
  constructor(scene, record) {
    this.scene = scene;
    this.record = record;
    this.frameCount = Math.floor(record.data.length / 3);
    this.time = 0;
    this.finished = true;
    this.wheelSpin = 0;

    this.model = createCarModel({ ghost: true });
    this.model.root.visible = false;
    scene.add(this.model.root);

    this.previous = new THREE.Vector3();
  }

  get position() { return this.model.root.position; }
  get heading() { return this.model.root.rotation.y; }
  get visible() { return this.model.root.visible; }

  /**
   * 绿灯亮起时调用一次，让幽灵车从起点线重新跑一整场。
   *
   * 【为什么只在发车时调用，而不是每圈】幽灵车录的是**整场**：
   * 它的第 0 帧也是"停在起点线上、速度 0"，和你一样是静止起步，
   * 所以两边从绿灯到终点线全程共用同一条时间轴，中途不需要重置。
   */
  restart() {
    if (this.frameCount < 2) return;
    this.time = 0;
    this.finished = false;
    this.wheelSpin = 0;
    this.model.root.visible = true;
    this.#sampleAt(0);
    this.previous.copy(this.model.root.position);
  }

  update(dt) {
    if (this.finished) return;

    this.time += dt;
    const last = this.frameCount - 1;
    const cursor = this.time * this.record.hz;

    if (cursor >= last) {
      // 幽灵车已经跑完自己那一整场（也就是说它比你快）。藏起来，别在终点线堵着。
      this.#sampleAt(last);
      this.finished = true;
      this.model.root.visible = false;
      return;
    }

    this.#sampleAt(cursor);

    // 用相邻两帧的位移估算车速，让轮子跟着转
    const moved = this.model.root.position.distanceTo(this.previous);
    this.wheelSpin += moved / CAR.wheelRadius;
    for (const wheel of this.model.wheels) wheel.tyre.rotation.x = this.wheelSpin;
    this.previous.copy(this.model.root.position);
  }

  /** 把浮点下标 cursor 处的姿态插值出来写进模型 */
  #sampleAt(cursor) {
    const i = Math.floor(cursor);
    const j = Math.min(i + 1, this.frameCount - 1);
    const k = cursor - i;
    const d = this.record.data;

    const x = THREE.MathUtils.lerp(d[i * 3] / POS_SCALE, d[j * 3] / POS_SCALE, k);
    const z = THREE.MathUtils.lerp(d[i * 3 + 1] / POS_SCALE, d[j * 3 + 1] / POS_SCALE, k);

    // 朝向走最短弧：把差值规整到 (-π, π] 再插值
    const h0 = d[i * 3 + 2] / HEADING_SCALE;
    const h1 = d[j * 3 + 2] / HEADING_SCALE;
    const delta = ((h1 - h0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

    this.model.root.position.set(x, 0, z);
    this.model.root.rotation.y = h0 + delta * k;
  }

  /** 重开一局时销毁（几何体和材质是专用的，要一起释放） */
  dispose() {
    this.scene.remove(this.model.root);
    this.model.root.traverse((object) => {
      if (object.isMesh) object.material.dispose();
      if (object.isMesh && object.geometry) object.geometry.dispose();
    });
  }
}
