import * as THREE from 'three';
import { CAMERA } from '../config.js';

/**
 * 第三人称追尾相机。
 *
 * 【为什么不做成"硬跟"】
 * 如果每帧把相机直接放到车辆后方的固定位置，画面会跟着车一起抖，
 * 看起来非常晕。这里的做法是：
 *
 *   目标位置 = 车后上方一点
 *   相机位置 = 相机位置 向 目标位置 做指数插值（lerp）
 *
 * 插值系数用 1 - exp(-k·dt)，这样无论帧率多少，追踪的"手感"都一致。
 * 相机注视点也略微提前到车前方，提前看到弯道。
 */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    /** 平滑后的相机位置 */
    this.position = new THREE.Vector3();
    /** 平滑后的注视点 */
    this.lookTarget = new THREE.Vector3();
    /** 屏幕抖动强度（撞车 / 草地） */
    this.shake = 0;
    /** 平滑侧倾角；侧滑时轻轻压向弯道，而不是随机抖动。 */
    this.roll = 0;
    this.sideOffset = 0;
    this.kick = 0;
  }

  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  /** 氮气释放瞬间向前推一小段，再指数回弹；不同于持续的加速 FOV。 */
  addBoostKick() { this.kick = 1; }

  /** 静止赛车对应的追车位；可供菜单转场复用，避免镜头目标重复计算。 */
  chasePose(car) {
    const forward = car.forward;
    return {
      position: new THREE.Vector3(
        car.position.x - forward.x * CAMERA.distance,
        CAMERA.height,
        car.position.z - forward.z * CAMERA.distance,
      ),
      target: new THREE.Vector3(
        car.position.x + forward.x * CAMERA.lookAhead,
        CAMERA.lookHeight,
        car.position.z + forward.z * CAMERA.lookAhead,
      ),
    };
  }

  showcasePose(car) {
    const forward = car.forward;
    const right = car.right;
    return {
      position: new THREE.Vector3(
        car.position.x - forward.x * CAMERA.showcaseBack + right.x * CAMERA.showcaseSide,
        CAMERA.showcaseHeight,
        car.position.z - forward.z * CAMERA.showcaseBack + right.z * CAMERA.showcaseSide,
      ),
      target: new THREE.Vector3(
        car.position.x + forward.x * 6,
        1.5,
        car.position.z + forward.z * 6,
      ),
    };
  }

  /** 直接把相机瞬移到车后（开局 / 重置用，避免镜头飞过去） */
  snapTo(car) {
    this.roll = 0;
    this.sideOffset = 0;
    this.shake = 0;
    this.kick = 0;
    const pose = this.chasePose(car);
    this.position.copy(pose.position);
    this.lookTarget.copy(pose.target);
    this.apply();
  }

  update(dt, car, { drifting = false, lateralSpeed = 0, reducedMotion = false } = {}) {
    const forward = car.forward;
    const speed = car.speed;
    const boosting = car.boost > 0;
    const slide = drifting && !reducedMotion ? THREE.MathUtils.clamp(lateralSpeed / 22, -1, 1) : 0;
    const smooth = 1 - Math.exp(-6 * dt);
    this.roll += (slide * 0.035 - this.roll) * smooth;
    this.sideOffset += (slide * 0.55 - this.sideOffset) * smooth;

    // 速度越快，机位越靠后、越高，视野越广 —— 速度感的主要来源
    this.kick = Math.max(0, this.kick - dt * 5);
    const distance = CAMERA.distance + speed * CAMERA.distanceSpeedGain - (reducedMotion ? 0 : this.kick * 0.85);
    const height = CAMERA.height + speed * CAMERA.heightSpeedGain;

    const right = car.right;
    const desired = new THREE.Vector3(
      car.position.x - forward.x * distance + right.x * this.sideOffset,
      height,
      car.position.z - forward.z * distance + right.z * this.sideOffset,
    );
    this.position.lerp(desired, 1 - Math.exp(-CAMERA.followLerp * dt));
    this.position.y = Math.max(this.position.y, CAMERA.minHeight);   // 别钻到地下

    const look = new THREE.Vector3(
      car.position.x + forward.x * CAMERA.lookAhead,
      CAMERA.lookHeight,
      car.position.z + forward.z * CAMERA.lookAhead,
    );
    this.lookTarget.lerp(look, 1 - Math.exp(-CAMERA.lookLerp * dt));

    this.apply();
    if (!reducedMotion) this.camera.rotateZ(this.roll);

    // 撞车抖动（尊重系统减少动态效果设置）
    if (this.shake > 0 && !reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // 动态 FOV：加速时视野拉开，产生"冲出去"的感觉
    const targetFov = CAMERA.fov + Math.min(speed, 70) * CAMERA.fovSpeedGain
      + (boosting && !reducedMotion ? CAMERA.fovBoost : 0)
      + (reducedMotion ? 0 : this.kick * 4);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }

  apply() {
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }
}
