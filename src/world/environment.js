import * as THREE from 'three';
import { COLORS } from '../config.js';
import { toon } from '../core/materials.js';

/**
 * 场景装饰：草地、草丛色块、树木、远山、云。
 * 全部是"低多边形 + 纯色"的卡通做法，不含任何贴图。
 *
 * 返回一个 { update(dt) }，用于每帧推进云朵飘动。
 */
export function createEnvironment(scene, track) {
  buildGround(scene);
  buildTrees(scene, track);
  buildHills(scene);
  const clouds = buildClouds(scene);

  return {
    update(dt) {
      for (const cloud of clouds) {
        cloud.position.x += dt * 1.6;
        if (cloud.position.x > 700) cloud.position.x = -700;   // 飘出边界就绕回另一侧
      }
    },
  };
}

/* ------------------------------------------------------------------ */

function buildGround(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(COLORS.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 随机撒一些深浅不同的圆形色块，让大片草地不那么单调
  const patchGeometry = new THREE.CircleGeometry(1, 12);
  for (let i = 0; i < 26; i++) {
    const patch = new THREE.Mesh(patchGeometry, toon(COLORS.grassShades[i % COLORS.grassShades.length]));
    const angle = Math.random() * Math.PI * 2;
    const radius = 120 + Math.random() * 340;
    patch.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
    patch.rotation.x = -Math.PI / 2;
    patch.scale.setScalar(25 + Math.random() * 60);
    scene.add(patch);
  }
}

/**
 * 树木。
 * 【为什么用 InstancedMesh】260 棵树 × 3 个部件 = 780 个 Mesh，
 * 逐个提交会让 CPU 每帧忙死。实例化渲染只需要 3 次绘制调用。
 * 【instanceColor】还能给每个实例单独染色，做出深浅不一的树林。
 */
function buildTrees(scene, track) {
  const spots = pickTreeSpots(track, 260);
  if (spots.length === 0) return;

  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.55, 3, 6);
  trunkGeometry.translate(0, 1.5, 0);                     // 让根部落在 y=0

  const leafBottom = new THREE.ConeGeometry(3.0, 5.5, 7);
  leafBottom.translate(0, 5.0, 0);

  const leafTop = new THREE.ConeGeometry(2.2, 4.5, 7);
  leafTop.translate(0, 7.6, 0);

  const trunk = new THREE.InstancedMesh(trunkGeometry, toon(COLORS.treeTrunk), spots.length);
  const bottom = new THREE.InstancedMesh(leafBottom, toon(COLORS.treeLeaf), spots.length);
  const top = new THREE.InstancedMesh(leafTop, toon(COLORS.treeLeaf), spots.length);
  trunk.castShadow = bottom.castShadow = top.castShadow = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  spots.forEach((spot, i) => {
    quaternion.setFromAxisAngle(up, spot.rotation);
    matrix.compose(
      new THREE.Vector3(spot.x, 0, spot.z),
      quaternion,
      new THREE.Vector3(spot.scale, spot.scale * spot.stretch, spot.scale),
    );
    trunk.setMatrixAt(i, matrix);
    bottom.setMatrixAt(i, matrix);
    top.setMatrixAt(i, matrix);

    color.setHSL(0.28 + Math.random() * 0.07, 0.55, 0.34 + Math.random() * 0.14);
    bottom.setColorAt(i, color);
    top.setColorAt(i, color.clone().offsetHSL(0, 0, 0.05));
  });

  scene.add(trunk, bottom, top);
}

/** 随机撒点，并保证树离赛道至少 22 个单位、不会长在马路上 */
function pickTreeSpots(track, wanted) {
  // 用稀疏采样点估算"到赛道的距离"，避免遍历 1200 个点
  const coarse = track.points.filter((_, i) => i % 8 === 0);
  const distanceToTrack = (x, z) => {
    let best = Infinity;
    for (const p of coarse) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  const spots = [];
  let guard = 0;
  while (spots.length < wanted && guard++ < wanted * 30) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 90 + Math.random() * 420;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (distanceToTrack(x, z) > 22) {
      spots.push({
        x, z,
        scale: 0.8 + Math.random() * 0.9,
        stretch: 0.9 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }
  return spots;
}

/** 远处的圆锥山，靠雾气自然变淡，形成纵深 */
function buildHills(scene) {
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const radius = 620 + Math.random() * 420;
    const height = 60 + Math.random() * 150;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(height * (0.8 + Math.random() * 0.7), height, 7),
      toon(new THREE.Color().setHSL(0.33, 0.35, 0.42 + Math.random() * 0.08).getHex()),
    );
    hill.position.set(Math.cos(angle) * radius, height / 2 - 6, Math.sin(angle) * radius);
    scene.add(hill);
  }
}

/** 云 = 几个低模球拼在一起 */
function buildClouds(scene) {
  const puffGeometry = new THREE.SphereGeometry(1, 8, 6);
  const cloudMaterial = toon(COLORS.cloud);
  const clouds = [];

  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set((j - puffs / 2) * 1.6 + Math.random(), Math.random() * 0.6, Math.random() * 0.8);
      puff.scale.setScalar(2.2 + Math.random() * 1.8);
      cloud.add(puff);
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = 150 + Math.random() * 500;
    cloud.position.set(Math.cos(angle) * radius, 70 + Math.random() * 60, Math.sin(angle) * radius);
    cloud.scale.setScalar(1.8 + Math.random() * 1.4);
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}
