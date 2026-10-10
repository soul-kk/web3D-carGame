import * as THREE from 'three';
import { COLORS, PROPS, TRACK } from '../config.js';
import { toon } from '../core/materials.js';

/**
 * 金币：沿赛道随机成串摆放，吃到就记分。
 * 金币会自转 + 上下浮动，被吃掉后做一个"放大消失"的小动画。
 */
export class Coins {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.list = [];

    // 圆柱体默认沿 Y 轴躺平，转 90° 让它像硬币一样竖着
    this.geometry = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14);
    this.geometry.rotateX(Math.PI / 2);
    this.material = toon(COLORS.coin, { emissive: 0xffa000, emissiveIntensity: 0.35 });

    this.reset();
  }

  /** 重新随机摆一遍（每局开始时调用） */
  reset() {
    for (const coin of this.list) this.scene.remove(coin.mesh);
    this.list.length = 0;

    for (let g = 0; g < PROPS.coinGroups; g++) {
      const startT = Math.random() * 0.96 + 0.02;
      // 一串金币共用一个横向偏移，排成一条线
      const offset = (Math.random() * 2 - 1) * 4.2;

      for (let k = 0; k < PROPS.coinsPerGroup; k++) {
        const t = (startT + k * 0.006) % 1;
        const p = this.track.pointAt(t);
        const n = this.track.normalAt(t);

        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.position.set(p.x + n.x * offset, PROPS.coinHeight, p.z + n.z * offset);
        mesh.castShadow = true;
        this.scene.add(mesh);

        this.list.push({
          mesh,
          baseY: PROPS.coinHeight,
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
 */
export class BoostPads {
  constructor(scene, track) {
    this.scene = scene;
    this.list = [];

    const texture = createPadTexture();
    const geometry = new THREE.PlaneGeometry(4.4, 6.4);

    for (const t of PROPS.boostPadParams) {
      const p = track.pointAt(t);
      const tan = track.tangentAt(t);
      const n = track.normalAt(t);
      const offset = (Math.random() * 2 - 1) * 3.5;

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0.9,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.atan2(tan.x, tan.z);
      mesh.position.set(p.x + n.x * offset, TRACK.surfaceY + 0.03, p.z + n.z * offset);

      scene.add(mesh);
      this.list.push({ mesh, position: mesh.position.clone(), flash: 0 });
    }
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
