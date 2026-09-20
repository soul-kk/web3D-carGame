import * as THREE from 'three';

/**
 * 简易粒子系统（轮胎扬尘 / 漂移白烟 / 碰撞火花）。
 *
 * 【对象池】粒子每帧都在生灭，如果每次都 new Mesh 会让 GC 频繁触发卡顿。
 * 这里预先创建固定数量的粒子反复复用（用完的粒子只是隐藏起来）。
 */
export class Particles {
  constructor(scene, count = 60) {
    this.pool = [];
    this.cursor = 0;

    const geometry = new THREE.IcosahedronGeometry(0.38, 0);
    for (let i = 0; i < count; i++) {
      // 每个粒子要有独立的材质，才能单独控制透明度
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0, maxLife: 1, velocity: new THREE.Vector3() });
    }
  }

  /** 在 (x,y,z) 冒出一团颜色为 color 的烟 */
  spawn(x, y, z, color) {
    const particle = this.pool[this.cursor % this.pool.length];
    this.cursor++;

    particle.mesh.visible = true;
    particle.mesh.position.set(x, y, z);
    particle.mesh.scale.setScalar(0.5);
    particle.mesh.material.color.setHex(color);
    particle.mesh.material.opacity = 0.75;

    particle.maxLife = particle.life = 0.7;
    // 随机初速度，让每团烟散开的形状都不一样
    particle.velocity.set(
      (Math.random() - 0.5) * 2.5,
      1.2 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2.5,
    );
  }

  update(dt) {
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;

      particle.life -= dt;
      if (particle.life <= 0) {
        particle.mesh.visible = false;
        continue;
      }

      particle.velocity.y -= 5 * dt;                      // 受重力
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.multiplyScalar(1 + 1.8 * dt);   // 边飘边扩散
      particle.mesh.material.opacity = (particle.life / particle.maxLife) * 0.7;  // 渐隐
    }
  }
}
