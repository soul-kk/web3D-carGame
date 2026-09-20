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
  }

  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  /** 直接把相机瞬移到车后（开局 / 重置用，避免镜头飞过去） */
  snapTo(car) {
    const forward = car.forward;
    this.position.set(
      car.position.x - forward.x * CAMERA.distance,
      CAMERA.height,
      car.position.z - forward.z * CAMERA.distance,
    );
    this.lookTarget.set(
      car.position.x + forward.x * CAMERA.lookAhead,
      CAMERA.lookHeight,
      car.position.z + forward.z * CAMERA.lookAhead,
    );
    this.apply();
  }

  update(dt, car) {
    const forward = car.forward;
    const speed = car.speed;
    const boosting = car.boost > 0;

    // 速度越快，机位越靠后、越高，视野越广 —— 速度感的主要来源
    const distance = CAMERA.distance + speed * CAMERA.distanceSpeedGain;
    const height = CAMERA.height + speed * CAMERA.heightSpeedGain;

    const desired = new THREE.Vector3(
      car.position.x - forward.x * distance,
      height,
      car.position.z - forward.z * distance,
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

    // 撞车抖动
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }

    // 动态 FOV：加速时视野拉开，产生"冲出去"的感觉
    const targetFov = CAMERA.fov + Math.min(speed, 70) * CAMERA.fovSpeedGain
      + (boosting ? CAMERA.fovBoost : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }

  apply() {
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }
}
