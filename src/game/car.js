import * as THREE from 'three';
import { CAR, COLORS, NITRO } from '../config.js';
import { toon, addOutline } from '../core/materials.js';

/**
 * 用几何体拼一辆卡通小车，车身朝 +Z（所以 heading=0 时车头指向 +Z，
 * 和 forward=(sin,cos) 的约定一致）。
 *
 * 【为什么要做成独立函数】玩家车和幽灵车（回放历史最佳）长得一样，
 * 只是材质不同。抽出来之后两边共用同一份模型定义，改车型只改一处。
 *
 * @param {{ ghost?: boolean }} [options] ghost=true 时用半透明材质、不投影
 * @returns {{ root: THREE.Group, chassis: THREE.Group, wheels: Array<object> }}
 */
export function createCarModel({ ghost = false } = {}) {
  /** 车身根节点：位置 + 朝向 */
  const root = new THREE.Group();
  /** 车身容器：单独承载侧倾 / 俯仰，不影响轮子 */
  const chassis = new THREE.Group();
  root.add(chassis);
  /** @type {Array<{pivot:THREE.Group, tyre:THREE.Mesh, rim:THREE.Mesh, front:boolean}>} */
  const wheels = [];

  // 幽灵车沿用原色，但整体半透明 —— 比纯色剪影更容易看清车型和朝向
  const material = (color) => (ghost
    ? toon(color, { transparent: true, opacity: 0.32, depthWrite: false })
    : toon(color));

  const add = (geometry, color, x, y, z, { outline = false } = {}) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    chassis.add(mesh);
    if (outline && !ghost) chassis.add(addOutline(mesh));   // 黑色描边副本
    return mesh;
  };

  // 车身
  add(new THREE.BoxGeometry(2.35, 0.85, 4.7), COLORS.carBody, 0, 0.88, 0, { outline: true });
  // 底盘
  add(new THREE.BoxGeometry(2.5, 0.35, 4.0), COLORS.carDark, 0, 0.5, 0);
  // 驾驶舱 / 车顶
  add(new THREE.BoxGeometry(1.75, 0.72, 2.1), COLORS.carGlass, 0, 1.55, -0.25, { outline: true });
  add(new THREE.BoxGeometry(1.9, 0.2, 2.0), COLORS.carBody, 0, 1.86, -0.25);
  // 尾翼
  add(new THREE.BoxGeometry(2.5, 0.16, 0.7), COLORS.carDark, 0, 1.75, -2.35, { outline: true });
  add(new THREE.BoxGeometry(0.18, 0.55, 0.4), COLORS.carDark, 0.85, 1.45, -2.35);
  add(new THREE.BoxGeometry(0.18, 0.55, 0.4), COLORS.carDark, -0.85, 1.45, -2.35);
  // 前灯 / 尾灯
  add(new THREE.BoxGeometry(0.5, 0.28, 0.16), 0xfff3b0, 0.72, 1.0, 2.36);
  add(new THREE.BoxGeometry(0.5, 0.28, 0.16), 0xfff3b0, -0.72, 1.0, 2.36);
  add(new THREE.BoxGeometry(0.45, 0.22, 0.14), 0xff2d3d, 0.7, 1.05, -2.36);
  add(new THREE.BoxGeometry(0.45, 0.22, 0.14), 0xff2d3d, -0.7, 1.05, -2.36);

  // 轮子：每个轮子外面套一个 pivot（转向轴），前轮只转 pivot
  const tyreGeometry = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.46, 14);
  tyreGeometry.rotateZ(Math.PI / 2);   // 圆柱默认立着，转 90° 变成"躺着的轮胎"
  const rimGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8);
  rimGeometry.rotateZ(Math.PI / 2);

  const layout = [
    { x: 1.2, z: 1.55, front: true },
    { x: -1.2, z: 1.55, front: true },
    { x: 1.2, z: -1.6, front: false },
    { x: -1.2, z: -1.6, front: false },
  ];
  for (const spot of layout) {
    const pivot = new THREE.Group();
    pivot.position.set(spot.x, CAR.wheelRadius, spot.z);

    const tyre = new THREE.Mesh(tyreGeometry, material(COLORS.tyre));
    tyre.castShadow = !ghost;
    const rim = new THREE.Mesh(rimGeometry, material(COLORS.rim));

    pivot.add(tyre, rim);
    root.add(pivot);
    wheels.push({ pivot, tyre, rim, front: spot.front });
  }

  return { root, chassis, wheels };
}

/**
 * 赛车：既负责"长什么样"，也负责"怎么动"。
 *
 * 【街机物理思路】
 * 真实车辆物理（轮胎模型、悬挂）非常复杂。小游戏用一套简化模型就够了：
 *
 *   1. 车只有一个朝向角 heading，以及一个世界坐标下的速度向量 velocity。
 *   2. 每帧把 velocity 分解成"车头方向"和"车身侧面"两个分量：
 *        vf = velocity · forward   → 前进速度
 *        vr = velocity · right     → 侧滑速度
 *   3. 油门只作用于 vf，转向只改变 heading；
 *      侧滑速度 vr 按指数衰减 —— 衰减越快抓地力越强，越慢越像漂移。
 *   4. 最后再把两个分量合回 velocity。
 *
 * 这套模型能自然地做出"加速、刹车、推头、甩尾、草地打滑"的手感，
 * 而且代码只有几十行。
 */
export class Car {
  constructor() {
    const model = createCarModel();
    /** 车身根节点：位置 + 朝向 */
    this.root = model.root;
    /** 车身容器：单独承载侧倾 / 俯仰，不影响轮子 */
    this.chassis = model.chassis;
    /** 轮子（轮胎 + 轮辋 + 转向轴） */
    this.wheels = model.wheels;

    /** 物理位置（直接复用 root.position，y 只用于草地颠簸） */
    this.position = this.root.position;
    /** 速度向量，x → 世界 X，y → 世界 Z */
    this.velocity = new THREE.Vector2();
    /** 朝向角（弧度）：forward = (sin, 0, cos) */
    this.heading = 0;
    /** 当前方向盘角度，-1 左 1 右 */
    this.steer = 0;
    /** 剩余氮气时间（秒） */
    this.boost = 0;
    /** 车轮累计转动角度 */
    this.wheelSpin = 0;
    /** 是否在赛道上（由外部根据赛道距离判定后传进来） */
    this.onTrack = true;
    /** 上一帧最近的赛道采样点下标，用于加速最近点搜索 */
    this.nearestIndex = 0;
    /** 手刹（漂移键）这一帧是否按下 */
    this.handbrake = false;
    /** 这一帧是否算"正在漂移"（手刹 + 在赛道上 + 真的在侧滑） */
    this.drifting = false;
    /** 氮气充能 0~1：漂移时上涨，满格后松开手刹自动喷 */
    this.driftCharge = 0;
  }

  /** 车速（标量） */
  get speed() { return this.velocity.length(); }

  /** 车头朝向的单位向量 */
  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** 车身右侧的单位向量 */
  get right() {
    return new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  /** 立刻把车放到指定位置和朝向（开局 / 重置用） */
  placeAt(position, heading, nearestIndex = 0) {
    this.position.set(position.x, 0, position.z);
    this.heading = heading;
    this.velocity.set(0, 0);
    this.steer = 0;
    this.boost = 0;
    this.nearestIndex = nearestIndex;
    this.handbrake = false;
    this.drifting = false;
    this.driftCharge = 0;
    this.root.rotation.y = heading;
    this.#updateVisuals(0, 0, 0, { throttle: 0, brake: 0, steer: 0 }, true);
  }

  applyBoost(seconds = CAR.boostDuration) {
    this.boost = seconds;
  }

  /**
   * 每帧物理更新。
   * @param {number} dt 距上一帧的秒数
   * @param {object} ctx
   * @param {{throttle:number,brake:number,steer:number,handbrake:number}} ctx.input 驾驶输入
   * @param {boolean} ctx.canDrive 倒计时 / 完赛时为 false，此时只能滑行
   * @param {boolean} ctx.onTrack 是否在铺装路面上
   * @returns {{forwardSpeed:number, lateralSpeed:number, speed:number,
   *            drifting:boolean, driftCharge:number, nitroFired:boolean}}
   */
  update(dt, { input, canDrive, onTrack }) {
    this.onTrack = onTrack;

    // 手刹只在能开车的时候生效（倒计时 / 完赛后按下不产生任何效果）
    const handbrake = Boolean(canDrive && input.handbrake);
    const wasHandbrake = this.handbrake;
    this.handbrake = handbrake;

    const forward = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    const right = new THREE.Vector2(Math.cos(this.heading), -Math.sin(this.heading));

    // 1. 把速度分解到车身坐标系
    let vf = this.velocity.dot(forward);   // 前进方向分量
    let vr = this.velocity.dot(right);     // 侧向分量

    const boosting = this.boost > 0;
    if (boosting) this.boost -= dt;

    // 2. 转向：先把方向盘平滑地转向目标角度，避免"瞬间打死"
    this.steer += (input.steer - this.steer) * Math.min(1, dt * 11);
    // 速度越快转向越迟钝；静止时打方向不动（和真车一样）
    const speedRatio = Math.min(Math.abs(vf) / CAR.maxSpeed, 1);
    const directionSign = Math.sign(vf) || 1;        // 倒车时转向相反
    const turnPower = CAR.turnRate
      * (1 - 0.35 * speedRatio)
      * Math.min(Math.abs(vf) / 9, 1)
      * (handbrake ? CAR.handbrakeTurnGain : 1);
    this.heading += this.steer * turnPower * directionSign * dt;

    // 3. 油门 / 刹车 / 倒车
    const maxSpeed = (onTrack ? CAR.maxSpeed : CAR.maxSpeed * CAR.offTrackSpeedFactor)
      * (boosting ? CAR.boostFactor : 1);

    if (canDrive && input.throttle) {
      vf += CAR.accel * (boosting ? CAR.boostAccelFactor : 1) * dt;
    } else if (canDrive && input.brake) {
      vf -= (vf > 0.6 ? CAR.brake : CAR.reverseAccel) * dt;
    } else {
      vf *= Math.exp(-1.1 * dt);                     // 松开油门自然减速
    }
    // 空气阻力 / 草地阻力。用 exp(-k·dt) 而不是减去固定值，这样不同帧率下手感一致。
    const drag = (onTrack ? CAR.onTrackDrag : CAR.offTrackDrag)
      + (handbrake ? CAR.handbrakeDrag : 0);
    vf *= Math.exp(-drag * dt);
    vf = THREE.MathUtils.clamp(vf, -CAR.reverseMax, maxSpeed);

    // 4. 侧向抓地力：指数衰减掉侧滑速度
    //    手刹把抓地力"压一个上限" → 车尾甩出去。松手刹后抓地力立刻恢复，
    //    所以漂移再乱也能一秒内救回来（"好上手、难精通"的关键）。
    let grip = onTrack ? CAR.gripOnTrack : CAR.gripOffTrack;
    if (handbrake) grip = Math.min(grip, CAR.handbrakeGrip);
    vr *= Math.exp(-grip * dt);

    // 5. 合回世界坐标速度，并推进位置
    this.velocity.set(forward.x * vf + right.x * vr, forward.y * vf + right.y * vr);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.y * dt;

    // 6. 漂移充能
    const nitroFired = this.#updateDrift(dt, { canDrive, handbrake, wasHandbrake, vf, vr, onTrack });

    this.#updateVisuals(dt, vf, vr, input, onTrack);

    return {
      forwardSpeed: vf,
      lateralSpeed: vr,
      speed: this.velocity.length(),
      drifting: this.drifting,
      driftCharge: this.driftCharge,
      nitroFired,
    };
  }

  /**
   * 漂移充能 + 释放氮气。
   *
   * 【顺序很重要】先判定"松开手刹"这个边沿，再算充能 / 衰减。
   * 如果反过来（先衰减再判满格），松手那一帧充能已经从 1 掉到 0.99，
   * 永远达不到 1，氮气就永远放不出来 —— 这个 bug 是被自动测试跑出来的。
   *
   * @returns {boolean} 这一帧是否喷出了氮气
   */
  #updateDrift(dt, { canDrive, handbrake, wasHandbrake, vf, vr, onTrack }) {
    const released = canDrive && wasHandbrake && !handbrake && this.driftCharge >= 1;
    if (released) {
      this.driftCharge = 0;
      this.applyBoost(NITRO.boostDuration);
    }

    this.drifting = handbrake
      && onTrack
      && Math.abs(vf) >= NITRO.driftMinSpeed
      && Math.abs(vr) >= NITRO.driftMinLateral;

    if (this.drifting) {
      this.driftCharge = Math.min(1, this.driftCharge + NITRO.chargeRate * dt);
    } else {
      this.driftCharge = Math.max(0, this.driftCharge - NITRO.decayRate * dt);
    }

    return released;
  }

  /* ================= 外观 ================= */

  #updateVisuals(dt, vf, vr, input, onTrack) {
    this.root.rotation.y = this.heading;

    // 转弯时车身向外侧倾 + 油门/刹车时抬头点头，纯装饰但很提手感
    this.chassis.rotation.z = THREE.MathUtils.clamp(-vr * 0.012, -0.13, 0.13);
    this.chassis.rotation.x = THREE.MathUtils.clamp(
      (input.throttle ? -0.03 : 0) + (input.brake && vf > 1 ? 0.05 : 0),
      -0.08, 0.08,
    );

    // 草地上颠一颠
    this.position.y = onTrack
      ? 0
      : Math.sin(performance.now() * 0.05) * 0.03 * Math.min(Math.abs(vf) / 20, 1);

    // 车轮：滚动 + 前轮转向
    this.wheelSpin += (vf / CAR.wheelRadius) * dt;
    for (const wheel of this.wheels) {
      wheel.tyre.rotation.x = this.wheelSpin;
      wheel.rim.rotation.x = this.wheelSpin;
      if (wheel.front) wheel.pivot.rotation.y = this.steer * 0.45;
    }
  }

}
