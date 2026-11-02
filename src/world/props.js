import * as THREE from 'three';
import { COLORS, PROPS, TRACK } from '../config.js';
import { toon } from '../core/materials.js';

/**
 * 金币：沿赛道成串摆放，吃到就记分。
 * 金币会自转 + 上下浮动，被吃掉后做一个"放大消失"的小动画。
 *
 * 【摆法从哪来】优先用地图自己写的 `props.coins`（哪几串、偏左还是偏右），
 * 地图没写才退回下面那套随机摆法。随机摆法的问题是每次开局金币位置都不一样，
 * 玩家永远记不住"哪条线有金币"，也就没有"专门去吃某串"这件事。
 */
export class Coins {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./track.js').Track} track
   * @param {object|null} plan 地图自定义摆法 { runs, count, spacing }
   */
  constructor(scene, track, plan = null) {
    this.scene = scene;
    this.track = track;
    /** 地图自定义摆法；null 表示用随机兜底 */
    this.plan = plan ?? null;
    this.list = [];

    // 圆柱体默认沿 Y 轴躺平，转 90° 让它像硬币一样竖着
    this.geometry = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14);
    this.geometry.rotateX(Math.PI / 2);
    this.material = toon(COLORS.coin, { emissive: 0xffa000, emissiveIntensity: 0.35 });

    this.reset();
  }

  /** 换地图：换摆法并重新摆一遍 */
  setPlan(plan) {
    this.plan = plan ?? null;
    this.reset();
  }

  /** 重新摆一遍（每局开始时调用） */
  reset() {
    for (const coin of this.list) this.scene.remove(coin.mesh);
    this.list.length = 0;

    if (this.plan) this.#placePlanned();
    else this.#placeRandom();
  }

  /** 照地图写的摆法放金币 */
  #placePlanned() {
    const { runs = [], count = PROPS.coinsPerRun, spacing = PROPS.coinSpacing } = this.plan;
    /** 间距用米，换成赛道参数 t 的增量（t 是按弧长均匀的） */
    const dt = spacing / this.track.totalLength;

    for (const run of runs) {
      const offset = run.offset ?? 0;
      for (let k = 0; k < count; k++) {
        const t = (run.t + k * dt) % 1;
        const surface = this.track.surfaceAt(t);
        // 断口正上方没有地面 —— 金币悬在熔岩上方，谁也吃不到，直接不摆
        if (surface.y === null) continue;

        const p = this.track.pointAt(t);
        const n = this.track.normalAt(t);

        const mesh = new THREE.Mesh(this.geometry, this.material);
        // 高度要跟着路面走：桥面上的金币必须在桥面上方，不能埋进桥板里
        mesh.position.set(p.x + n.x * offset, surface.y + PROPS.coinHeight, p.z + n.z * offset);
        mesh.castShadow = false;   // 金币悬在 1.5 m 高，硬阴影在路面上是一块黑饼
        this.scene.add(mesh);

        this.list.push({
          mesh,
          baseY: surface.y + PROPS.coinHeight,
          spin: Math.random() * Math.PI * 2,
          alive: true,
          dyingFor: 0,
        });
      }
    }
  }

  /** 兜底：沿赛道随机成串摆放 */
  #placeRandom() {
    for (let g = 0; g < PROPS.coinRuns; g++) {
      const startT = Math.random() * 0.96 + 0.02;
      // 一串金币共用一个横向偏移，排成一条线
      const offset = (Math.random() * 2 - 1) * 4.2;

      for (let k = 0; k < PROPS.coinsPerRun; k++) {
        const t = (startT + k * 0.006) % 1;
        const surface = this.track.surfaceAt(t);
        if (surface.y === null) continue;

        const p = this.track.pointAt(t);
        const n = this.track.normalAt(t);

        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.position.set(p.x + n.x * offset, surface.y + PROPS.coinHeight, p.z + n.z * offset);
        mesh.castShadow = false;   // 金币悬在 1.5 m 高，硬阴影在路面上是一块黑饼
        this.scene.add(mesh);

        this.list.push({
          mesh,
          baseY: surface.y + PROPS.coinHeight,
          spin: Math.random() * Math.PI * 2,
          alive: true,
          dyingFor: 0,
        });
      }
    }
  }

  /** 每帧：自转、浮动、播放消失动画 */
  update(dt) {
    const time = performance.now() * 0.003;
    for (const coin of this.list) {
      if (!coin.alive) {
        if (coin.dyingFor > 0) {
          coin.dyingFor -= dt;
          // 【为什么只能这么小】金币在被吃掉的原地"膨一下"就消失，
          // 但车已经开过去了，这个金币正好落在摄像机前面。
          // 原来用 1 + 6 * dt 长 0.25 秒（最多胀到 4.5 倍），
          // 实测是一个挡住半个屏幕的黄色大墙（4.17 倍 / 距摄像机 10.8）。
          // 所以改成小幅度快消失：保留"弹一下"的手感，不挡视线。
          coin.mesh.scale.multiplyScalar(1 + 2.2 * dt);
          if (coin.dyingFor <= 0) coin.mesh.visible = false;
        }
        continue;
      }
      coin.spin += dt * 3;
      coin.mesh.rotation.z = coin.spin;
      coin.mesh.position.y = coin.baseY + Math.sin(time + coin.baseY) * 0.18;
    }
  }

  /**
   * 判定是否吃到金币。
   * @param {THREE.Vector3} position 赛车位置
   * @returns {THREE.Vector3|null} 被吃掉的金币位置（用于播放粒子），没吃到返回 null
   */
  collect(position) {
    for (const coin of this.list) {
      if (!coin.alive) continue;
      if (position.distanceTo(coin.mesh.position) < PROPS.coinRadius) {
        coin.alive = false;
        coin.dyingFor = 0.2;
        return coin.mesh.position.clone();
      }
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */

/**
 * 加速带：压上去会获得一段"氮气"，速度和加速度都会提升。
 *
 * 【摆法从哪来】优先用地图自己写的 `props.boosts`；
 * 地图没写才退回 `PROPS.boostPadParams` 那几个默认位置。
 */
export class BoostPads {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./track.js').Track} track
   * @param {Array<{t:number, offset?:number}>|null} plan 地图自定义摆法
   */
  constructor(scene, track, plan = null) {
    this.scene = scene;
    this.track = track;
    this.plan = plan ?? null;
    this.list = [];

    // 几何体和贴图只建一次：换地图时复用，别每次都新建一份把显存漏掉
    this.geometry = new THREE.PlaneGeometry(3.8, 5.4);
    this.texture = createPadTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, opacity: 0.9,
    });

    this.#place();
  }

  /** 按当前摆法放加速带 */
  #place() {
    const track = this.track;
    const specs = this.plan ?? PROPS.boostPadParams.map((t) => ({ t, offset: 0 }));

    for (const spec of specs) {
      const t = spec.t;
      const surface = track.surfaceAt(t);
      if (surface.y === null) continue;   // 断口上方没有路面，放不了加速带

      const p = track.pointAt(t);
      const tan = track.tangentAt(t);
      const n = track.normalAt(t);
      const offset = spec.offset ?? 0;

      const mesh = new THREE.Mesh(this.geometry, this.material);
      // 抬到中线虚线（虚线顶面在 surfaceY+0.03）之上 0.04：
      // 两者共面时会在加速带下面闪"z-fighting"，那条虚线还会从带子底下穿出来。
      mesh.position.set(
        p.x + n.x * offset,
        surface.y + TRACK.surfaceY + 0.07,
        p.z + n.z * offset,
      );
      // 加速带要贴着路面：桥坡上也得跟着倾斜，否则会半截插进桥板
      orientToSurface(mesh, track, t, surface);

      this.scene.add(mesh);
      this.list.push({ mesh, position: mesh.position.clone(), flash: 0 });
    }
  }

  /** 换地图后按新赛道重摆加速带 */
  rebuild(track, plan = null) {
    this.track = track;
    this.plan = plan ?? null;
    for (const pad of this.list) this.scene.remove(pad.mesh);
    this.list.length = 0;
    this.#place();
  }

  reset() {
    for (const pad of this.list) {
      pad.flash = 0;
      pad.mesh.scale.set(1, 1, 1);
    }
  }

  update(dt) {
    for (const pad of this.list) {
      if (pad.flash <= 0) continue;
      pad.flash -= dt;
      const scale = 1 + Math.max(0, pad.flash) * 1.2;   // 被压到时弹一下
      pad.mesh.scale.set(scale, scale, 1);
    }
  }

  /** 返回 true 表示这一帧触发了加速（同一个 pad 不能连点，用 flash 判断） */
  tryTrigger(position) {
    for (const pad of this.list) {
      if (pad.flash > 0) continue;
      if (position.distanceTo(pad.position) < PROPS.boostTriggerRadius) {
        pad.flash = 0.4;
        return true;
      }
    }
    return false;
  }
}

/**
 * 把一个"平铺的面"贴到赛道路面上，并让它的长度方向沿着前进方向。
 *
 * 【为什么不用 rotation.x / rotation.z】欧拉角要同时表达"转向"和"抬头"，
 * 顺序一换结果就不对，贴图的前后方向也容易弄反。这里直接搭一个正交基：
 *   z 轴 = 路面法线（往上）
 *   y 轴 = 行进方向的反向（贴图的"上"朝着车来的方向，箭头才指向车前方）
 *   x 轴 = y × z（保证右手系）
 * 三个轴定死，面的朝向就唯一了，桥坡上也不会插进桥板里。
 *
 * @param {THREE.Mesh} mesh 平面网格（PlaneGeometry，法线是局部 +Z）
 * @param {import('./track.js').Track} track
 * @param {number} t 赛道参数
 * @param {{y:number|null, slope:number}} surface 路面高度与坡度
 */
function orientToSurface(mesh, track, t, surface) {
  const tangent = track.tangentAt(t);
  const lateral = track.normalAt(t);
  // 路面切线：水平方向不变，叠上坡度 → 桥坡上的行进方向是斜的
  const direction = new THREE.Vector3(tangent.x, surface.slope, tangent.z).normalize();
  // 路面法线 = 行进方向 × 横向（平地时正好是"上"）
  const normal = new THREE.Vector3().crossVectors(direction, lateral).normalize();
  // 贴图的"上"朝着来车方向，于是贴图上画的箭头指向车前方
  const backward = direction.clone().negate();
  const right = new THREE.Vector3().crossVectors(backward, normal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, backward, normal);
  mesh.quaternion.setFromRotationMatrix(matrix);
}

function createPadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#19c6ff';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(24, 40 + k * 70);
    ctx.lineTo(64, 82 + k * 70);
    ctx.lineTo(104, 40 + k * 70);
    ctx.lineTo(104, 66 + k * 70);
    ctx.lineTo(64, 108 + k * 70);
    ctx.lineTo(24, 66 + k * 70);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
