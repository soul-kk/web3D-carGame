import * as THREE from 'three';
import { CAR, COLORS, NITRO } from '../config.js';
import { toon, addOutline, outlineMaterial } from '../core/materials.js';
import { getSkinById, DEFAULT_SKIN } from './skins.js';

/**
 * 释放一个模型用到的几何体和材质。
 *
 * 【为什么描边材质要特殊对待】描边材质是全局共享的一个实例
 * （core/materials.js 里的 outlineMaterial），所有车都用它。
 * 一起释放的话，换个皮肤就会把别的车的描边也弄坏。
 */
function disposeModel(model) {
  model.root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const material = object.material;
    if (material && material !== outlineMaterial) material.dispose();
  });
}

/**
 * 用几何体拼一辆卡通小车，车身朝 +Z（所以 heading=0 时车头指向 +Z，
 * 和 forward=(sin,cos) 的约定一致）。
 *
 * 【为什么要做成独立函数】玩家车和幽灵车（回放历史最佳）长得一样，
 * 只是材质不同。抽出来之后两边共用同一份模型定义，改车型只改一处。
 *
 * 【为什么要按 skinId 分叉】不同皮肤的车型结构完全不同（赛车有轮子、
 * 飞碟是悬浮的圆盘），硬塞进一个模型里只会写出一堆 if。
 * 分成两个独立的建模函数，各自干净，改一款不影响另一款。
 *
 * @param {{ ghost?: boolean, skinId?: string }} [options] ghost=true 时用半透明材质、不投影; skinId 指定皮肤
 * @returns {{ root: THREE.Group, chassis: THREE.Group, wheels: Array<object>, animate?: (t:number)=>void }}
 */
export function createCarModel({ ghost = false, skinId = DEFAULT_SKIN } = {}) {
  const skin = getSkinById(skinId);
  if (skin.id === 'saucer') return createSaucerModel(ghost, skin);
  return createRacerModel(ghost, skin);
}

/**
 * 经典赛车：方盒子车身 + 四个轮子。
 * @param {boolean} ghost
 * @param {object} skin
 */
function createRacerModel(ghost, skin) {
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
  add(new THREE.BoxGeometry(2.35, 0.85, 4.7), skin.body, 0, 0.88, 0, { outline: true });
  // 底盘
  add(new THREE.BoxGeometry(2.5, 0.35, 4.0), skin.dark, 0, 0.5, 0);
  // 驾驶舱 / 车顶
  add(new THREE.BoxGeometry(1.75, 0.72, 2.1), skin.glass, 0, 1.55, -0.25, { outline: true });
  add(new THREE.BoxGeometry(1.9, 0.2, 2.0), skin.body, 0, 1.86, -0.25);
  // 尾翼
  add(new THREE.BoxGeometry(2.5, 0.16, 0.7), skin.dark, 0, 1.75, -2.35, { outline: true });
  add(new THREE.BoxGeometry(0.18, 0.55, 0.4), skin.dark, 0.85, 1.45, -2.35);
  add(new THREE.BoxGeometry(0.18, 0.55, 0.4), skin.dark, -0.85, 1.45, -2.35);
  // 前灯 / 尾灯
  add(new THREE.BoxGeometry(0.5, 0.28, 0.16), skin.glow, 0.72, 1.0, 2.36);
  add(new THREE.BoxGeometry(0.5, 0.28, 0.16), skin.glow, -0.72, 1.0, 2.36);
  add(new THREE.BoxGeometry(0.45, 0.22, 0.14), skin.accent, 0.7, 1.05, -2.36);
  add(new THREE.BoxGeometry(0.45, 0.22, 0.14), skin.accent, -0.7, 1.05, -2.36);

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
 * 飞碟：上下两个锥体夹一个圆盘，顶上一个玻璃罩。
 *
 * 【和赛车完全不同的两点】
 *   1. 没有轮子 —— 靠 animate() 做出悬浮的起伏和自转。
 *   2. 圆盘是"轴对称"的，看不出车头朝哪。所以前面特意加了一组
 *      头灯 + 探照灯锥，让人一眼能分清前后（赛车靠车头灯，飞碟靠这对灯）。
 */
function createSaucerModel(ghost, skin) {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  /** 车身容器：真正会上下浮动、摇晃的部分 */
  const body = new THREE.Group();
  chassis.add(body);

  const material = (color) => (ghost
    ? toon(color, { transparent: true, opacity: 0.32, depthWrite: false })
    : toon(color));

  const add = (geometry, color, x, y, z, { outline = false } = {}) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    body.add(mesh);
    if (outline && !ghost) body.add(addOutline(mesh));
    return mesh;
  };

  // 底部推进器舱
  add(new THREE.CylinderGeometry(0.95, 0.68, 0.34, 16), skin.dark, 0, 0.62, 0);
  // 向下喷的尾焰（圆锥默认朝上，转 180° 朝下）
  const flame = new THREE.ConeGeometry(0.5, 0.8, 12);
  flame.rotateX(Math.PI);
  add(flame, skin.glow, 0, 0.2, 0);
  // 碟身主体
  add(new THREE.CylinderGeometry(2.2, 1.15, 0.5, 28), skin.body, 0, 1.05, 0, { outline: true });
  // 碟身上锥
  add(new THREE.CylinderGeometry(1.25, 2.2, 0.45, 28), skin.body, 0, 1.5, 0, { outline: true });
  // 腰线灯环
  const ring = new THREE.TorusGeometry(1.95, 0.13, 8, 32);
  ring.rotateX(Math.PI / 2);
  add(ring, skin.glow, 0, 1.05, 0);
  // 座舱罩（半球），稍微靠后一点，把前面让给头灯
  add(
    new THREE.SphereGeometry(0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    skin.glass, 0, 1.68, -0.15, { outline: true },
  );
  // 顶灯
  add(new THREE.ConeGeometry(0.22, 0.45, 10), skin.glow, 0, 2.45, 0);
  // 车头识别灯 + 前探照灯（告诉玩家车头朝哪）
  add(new THREE.BoxGeometry(0.5, 0.2, 0.35), skin.accent, 0, 1.0, 2.15, { outline: true });
  const beam = new THREE.ConeGeometry(0.3, 0.6, 12);
  beam.rotateX(Math.PI / 2);        // 圆锥默认朝 +Y，转过来朝 +Z
  add(beam, skin.glow, 0, 0.95, 2.4);

  // 绕着腰线的一圈小灯珠：整圈缓慢自转，飞碟就有了"动力在转"的感觉
  const beads = new THREE.Group();
  beads.position.y = 1.05;
  body.add(beads);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      material(skin.glow),
    );
    bead.position.set(Math.cos(angle) * 1.95, 0, Math.sin(angle) * 1.95);
    beads.add(bead);
  }

  const animate = (t) => {
    body.position.y = 0.16 + Math.sin(t * 2.3) * 0.13;   // 悬浮起伏
    body.rotation.z = Math.sin(t * 1.4) * 0.05;           // 轻微摇晃
    beads.rotation.y = t * 1.1;                          // 灯珠自转
  };

  return { root, chassis, wheels: [], animate };
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
  /**
   * @param {{ skinId?: string }} [options] skinId 指定初始皮肤
   */
  constructor({ skinId = DEFAULT_SKIN } = {}) {
    this.skinId = getSkinById(skinId).id;
    this.model = createCarModel({ skinId: this.skinId });
    /** 车身根节点：位置 + 朝向 */
    this.root = this.model.root;
    /** 车身容器：单独承载侧倾 / 俯仰，不影响轮子 */
    this.chassis = this.model.chassis;
    /** 轮子（轮胎 + 轮辋 + 转向轴）。飞碟没有轮子，是空数组 */
    this.wheels = this.model.wheels;
    /** 模型自带的小动画（飞碟的悬浮起伏），赛车没有 */
    this.animate = this.model.animate ?? null;
    /** 累计时间，喂给模型的小动画 */
    this.elapsed = 0;

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
   * 换皮肤：把旧模型拆掉，换一套新的挂到同一个 root 上。
   *
   * 【为什么要"原地换"而不是重建整辆车】root 上带着物理位置和朝向，
   * 重建的话车会瞬移到起点。原地换只动模型内容，位置、速度、圈数全都不动，
   * 所以比赛中途换皮肤也不会打断比赛。
   */
  setSkin(skinId) {
    const skin = getSkinById(skinId);
    if (skin.id === this.skinId) return;

    const old = this.model;
    const model = createCarModel({ skinId: skin.id });

    // 先释放旧资源，再摘掉旧部件 —— 顺序反了就找不到旧网格了
    disposeModel(old);
    for (const child of [...this.root.children]) this.root.remove(child);

    this.root.add(model.chassis);
    for (const wheel of model.wheels) this.root.add(wheel.pivot);

    this.model = model;
    this.chassis = model.chassis;
    this.wheels = model.wheels;
    this.animate = model.animate ?? null;
    this.skinId = skin.id;
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
    this.elapsed += dt;
    this.root.rotation.y = this.heading;

    // 模型自带的小动画（飞碟的悬浮起伏）。赛车没有这一段，animate 为 null。
    this.animate?.(this.elapsed);

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
