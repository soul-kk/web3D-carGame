import * as THREE from 'three';
import { COLORS, TRACK } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0);
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

/**
 * 后轮胎痕：一块 InstancedMesh 复用固定数量的短线段。
 * 只在有效漂移且在赛道上时画；逐段按寿命淡到路面颜色，不创建无限网格。
 */
export class Skidmarks {
  constructor(scene, count = 240) {
    this.pool = Array.from({ length: count }, () => ({ life: 0, maxLife: 3.2 }));
    this.cursor = 0;
    this.spacing = 0;
    this.previous = null;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.road = new THREE.Color(COLORS.road);
    this.rubber = new THREE.Color(0x222838);
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      count,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < count; i++) this.#hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  #hide(i) {
    this.dummy.position.set(0, -10, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  /** 清理旧赛程痕迹，断开上一段轨迹（R 复位时不会画出跨地图直线）。 */
  reset() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].life = 0;
      this.#hide(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.previous = null;
    this.spacing = 0;
    this.cursor = 0;
  }

  breakTrail() {
    this.previous = null;
    this.spacing = 0;
  }

  /** 用后轴两个端点绘制双线段。 */
  update(dt, car, drifting) {
    let changed = false;
    for (let i = 0; i < this.pool.length; i++) {
      const mark = this.pool[i];
      if (mark.life <= 0) continue;
      mark.life -= dt;
      if (mark.life <= 0) {
        this.#hide(i);
        changed = true;
      } else {
        // instanceColor 从深色逐渐过渡到路面色；不依赖整批共享材质的 opacity。
        this.color.copy(this.road).lerp(this.rubber, Math.min(0.65, mark.life / mark.maxLife * 0.65));
        this.mesh.setColorAt(i, this.color);
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    if (!drifting || !car.onTrack || dt > 0.1) {
      this.breakTrail();
    } else {
      const f = car.forward;
      const r = car.right;
      const x = car.position.x - f.x * 1.55;
      const z = car.position.z - f.z * 1.55;
      const now = [
        { x: x + r.x * 1.2, z: z + r.z * 1.2 },
        { x: x - r.x * 1.2, z: z - r.z * 1.2 },
      ];
      if (this.previous) {
        const length = Math.hypot(now[0].x - this.previous[0].x, now[0].z - this.previous[0].z);
        this.spacing += length;
        // 小段接起来是连续的；大跳跃（重置位置等）直接断开。
        if (length > 0.08 && length < 3 && this.spacing > 0.55) {
          for (let wheel = 0; wheel < 2; wheel++) this.#stamp(this.previous[wheel], now[wheel]);
          this.spacing = 0;
          changed = true;
        }
      }
      this.previous = now;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  #stamp(a, b) {
    const i = this.cursor++ % this.pool.length;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    this.dummy.position.set((a.x + b.x) / 2, TRACK.surfaceY + 0.045, (a.z + b.z) / 2);
    // 平面局部 +Y 先映射到世界 +Z，再绕 Y 转到这一小段的前进方向。
    this.dummy.quaternion.setFromAxisAngle(UP, Math.atan2(dx, dz)).multiply(FLAT);
    this.dummy.scale.set(0.55, length + 0.25, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.pool[i].life = this.pool[i].maxLife;
    this.mesh.setColorAt(i, this.rubber);
  }
}
