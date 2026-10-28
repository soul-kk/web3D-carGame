import * as THREE from 'three';
import { toon } from '../core/materials.js';

/**
 * 场景装饰：草地、草丛色块、树木、远山、云。
 * 全部是"低多边形 + 纯色"的卡通做法，不含任何贴图。
 *
 * 返回一个 { update(dt), rebuild(track, theme) }：
 * update 每帧推进云朵飘动，rebuild 用来换地图时按新主题把整个装饰重造一遍。
 */
export function createEnvironment(scene, track, theme) {
  const state = {
    /** 这套装饰往场景里加过的东西，换主题时按这个清单清掉 */
    objects: [],
    clouds: [],
    /** 飞灰（火山图） */
    embers: [],
    track,
    theme,
  };

  const rebuild = (nextTrack, nextTheme) => {
    clearObjects(scene, state.objects);
    state.objects.length = 0;
    state.clouds.length = 0;
    state.embers.length = 0;
    state.track = nextTrack;
    state.theme = nextTheme;

    if (nextTheme.scenery === 'volcano') {
      state.objects.push(...buildVolcanoGround(scene, nextTheme, nextTrack));
      state.objects.push(...buildObsidian(scene, nextTrack, nextTheme));
      state.objects.push(...buildVolcanoHills(scene, nextTheme));
      state.objects.push(...buildAshClouds(scene, nextTheme, state.clouds));
      state.objects.push(...buildEmbers(scene, nextTheme, state.embers));
    } else {
      state.objects.push(...buildGround(scene, nextTheme));
      state.objects.push(...buildTrees(scene, nextTrack, nextTheme));
      state.objects.push(...buildHills(scene, nextTheme));
      state.objects.push(...buildClouds(scene, nextTheme, state.clouds));
    }
  };

  rebuild(track, theme);

  return {
    update(dt) {
      for (const cloud of state.clouds) {
        cloud.position.x += dt * 1.6;
        if (cloud.position.x > 700) cloud.position.x = -700;   // 飘出边界就绕回另一侧
      }
      // 飞灰：慢慢往上飘，飘到顶就重新掉回地面
      for (const ember of state.embers) {
        ember.position.y += ember.userData.rise * dt;
        ember.position.x += ember.userData.drift * dt;
        if (ember.position.y > ember.userData.top) {
          ember.position.y = 0;
          ember.position.x = ember.userData.homeX + (Math.random() - 0.5) * 90;
        }
      }
    },
    rebuild,
  };
}

/* ------------------------------------------------------------------ */

/** 把场景里属于这套装饰的东西清掉并释放显存 */
function clearObjects(scene, objects) {
  for (const object of objects) {
    scene.remove(object);
    object.traverse?.((child) => {
      if (!child.isMesh && !child.isInstancedMesh) return;
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }
}

function buildGround(scene, theme) {
  const objects = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(theme.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  objects.push(ground);

  // 随机撒一些深浅不同的圆形色块，让大片草地不那么单调
  const patchGeometry = new THREE.CircleGeometry(1, 12);
  for (let i = 0; i < 26; i++) {
    const patch = new THREE.Mesh(patchGeometry, toon(theme.grassShades[i % theme.grassShades.length]));
    const angle = Math.random() * Math.PI * 2;
    const radius = 120 + Math.random() * 340;
    patch.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
    patch.rotation.x = -Math.PI / 2;
    patch.scale.setScalar(25 + Math.random() * 60);
    scene.add(patch);
    objects.push(patch);
  }
  return objects;
}

/**
 * 树木。
 * 【为什么用 InstancedMesh】260 棵树 × 3 个部件 = 780 个 Mesh，
 * 逐个提交会让 CPU 每帧忙死。实例化渲染只需要 3 次绘制调用。
 * 【instanceColor】还能给每个实例单独染色，做出深浅不一的树林。
 */
function buildTrees(scene, track, theme) {
  const objects = [];
  const spots = pickTreeSpots(track, 260);
  if (spots.length === 0) return objects;

  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.55, 3, 6);
  trunkGeometry.translate(0, 1.5, 0);                     // 让根部落在 y=0

  const leafBottom = new THREE.ConeGeometry(3.0, 5.5, 7);
  leafBottom.translate(0, 5.0, 0);

  const leafTop = new THREE.ConeGeometry(2.2, 4.5, 7);
  leafTop.translate(0, 7.6, 0);

  const trunk = new THREE.InstancedMesh(trunkGeometry, toon(theme.treeTrunk), spots.length);
  const bottom = new THREE.InstancedMesh(leafBottom, toon(theme.treeLeaf), spots.length);
  const top = new THREE.InstancedMesh(leafTop, toon(theme.treeLeaf), spots.length);
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

    color.setHSL(theme.treeHue + Math.random() * 0.07, theme.treeSat, theme.treeLight + Math.random() * 0.14);
    bottom.setColorAt(i, color);
    top.setColorAt(i, color.clone().offsetHSL(0, 0, 0.05));
  });

  scene.add(trunk, bottom, top);
  objects.push(trunk, bottom, top);
  return objects;
}

/**
 * 做一个"某点离赛道中心线多远"的取样器。
 *
 * 【为什么要稀疏采样】赛道有 1200 个采样点，每个装饰物都遍历一遍太浪费。
 * 每 8 个取 1 个（150 个点）足够判断"是不是在路上"，而且只算一次、缓存起来。
 *
 * @param {import('./track.js').Track} track
 * @returns {(x:number, z:number)=>number} 到赛道的距离（世界单位）
 */
function trackDistanceSampler(track) {
  const coarse = track.points.filter((_, i) => i % 8 === 0);
  return (x, z) => {
    let best = Infinity;
    for (const p of coarse) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

/**
 * 在一个圆环区域里找一个"离赛道足够远"的点。
 * 找不到就返回 null（调用方跳过这个装饰物），绝不硬塞到路面上。
 *
 * @param {(x:number, z:number)=>number} distanceToTrack 取样器
 * @param {number} minRadius 离圆心至少多远
 * @param {number} maxRadius 离圆心最多多远
 * @param {number} minDistance 离赛道中心线至少多远
 */
function findSpotAwayFromTrack(distanceToTrack, minRadius, maxRadius, minDistance) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (distanceToTrack(x, z) > minDistance) return { x, z };
  }
  return null;
}

/** 随机撒点，并保证树离赛道至少 22 个单位、不会长在马路上 */
function pickTreeSpots(track, wanted) {
  const distanceToTrack = trackDistanceSampler(track);

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
function buildHills(scene, theme) {
  const objects = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const radius = 620 + Math.random() * 420;
    const height = 60 + Math.random() * 150;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(height * (0.8 + Math.random() * 0.7), height, 7),
      toon(new THREE.Color().setHSL(
        theme.hill.hue,
        theme.hill.sat,
        theme.hill.light + Math.random() * 0.08,
      ).getHex()),
    );
    hill.position.set(Math.cos(angle) * radius, height / 2 - 6, Math.sin(angle) * radius);
    scene.add(hill);
    objects.push(hill);
  }
  return objects;
}

/** 云 = 几个低模球拼在一起 */
function buildClouds(scene, theme, clouds) {
  const objects = [];
  const puffGeometry = new THREE.SphereGeometry(1, 8, 6);
  const cloudMaterial = toon(theme.cloud);

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
    objects.push(cloud);
  }
  return objects;
}

/* ================================================================== */
/* 火山地貌                                                            */
/* ================================================================== */

/**
 * 火山地面：黑色玄武岩 + 到处裂开的熔岩缝 + 桥下那条熔岩河。
 *
 * 【为什么熔岩要用不受光材质】熔岩是"自己在发光"，不是被太阳照亮的，
 * 所以用 MeshBasicMaterial（不吃光照），颜色直接给最亮的橙红。
 */
function buildVolcanoGround(scene, theme, track) {
  const objects = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(theme.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  objects.push(ground);

  const lavaMaterial = new THREE.MeshBasicMaterial({ color: theme.lava });
  const crustMaterial = toon(0x241b1f);
  const distanceToTrack = trackDistanceSampler(track);

  // 地表上零散的熔岩裂缝：细长的发光条，随机方向
  // 【为什么也要避开赛道】裂缝是"地面上的一块凸起"，长在路面上会挡住加速带、
  // 甚至被车压过去时穿模。跟树一样，先量一下离赛道多远。
  //
  // 【为什么留这么远】裂缝最长 26 × 1.6 = 41 米，是"斜着躺在地上"的一条。
  // 只看中心点不够 —— 中心离得远，尾巴照样能扫到路面上，
  // 所以这里按"最长那条的一半 + 路宽"留余量。
  const crackGeometry = new THREE.BoxGeometry(4, 0.5, 26);
  const crackHalfLength = (26 * 1.6) / 2;
  for (let i = 0; i < 16; i++) {
    const spot = findSpotAwayFromTrack(distanceToTrack, 80, 400, track.halfWidth + crackHalfLength + 4);
    if (!spot) continue;
    const crack = new THREE.Mesh(crackGeometry, lavaMaterial);
    crack.position.set(spot.x, 0.06, spot.z);
    crack.rotation.y = Math.random() * Math.PI;
    crack.scale.set(0.6 + Math.random(), 1, 0.5 + Math.random() * 1.6);
    scene.add(crack);
    objects.push(crack);
  }

  // 碎岩块：给平坦的地面一点起伏
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const spot = findSpotAwayFromTrack(distanceToTrack, 70, 430, track.halfWidth + 12);
    if (!spot) continue;
    const rock = new THREE.Mesh(rockGeometry, crustMaterial);
    rock.position.set(spot.x, 0.4, spot.z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1 + Math.random() * 3, 0.6 + Math.random() * 2.4, 1 + Math.random() * 3);
    rock.castShadow = true;
    scene.add(rock);
    objects.push(rock);
  }

  // 桥下的熔岩河：断桥之所以恐怖，是因为桥下就是它
  const bridge = track.bridge;
  if (bridge) {
    const river = buildLavaRiver(track, theme, bridge);
    scene.add(river);
    objects.push(river);
  }

  return objects;
}

/**
 * 桥下的熔岩河。
 *
 * 【为什么不能用一个大盒子】原来这里是"沿桥的方向摆一个长方体"。
 * 但赛道是弯的 —— 一个直盒子会盖到桥以外的路面上去：那段路会直接埋进
 * 发光的熔岩里（连压在上面的加速带也一起埋掉，车开过去等于开进岩浆）。
 *
 * 【怎么改】顺着赛道曲线铺一条带子，宽度按桥面高度渐变：
 * 桥面还低的地方（坡道脚下）把河收窄到 0，桥面升高了河才变宽。
 * 于是熔岩只出现在桥底下，绝不会碰到路面。
 */
function buildLavaRiver(track, theme, bridge) {
  const group = new THREE.Group();
  const lavaMaterial = new THREE.MeshBasicMaterial({ color: theme.lava });
  const crustMaterial = toon(0x241b1f);
  /** 河的最大半宽（米） */
  const halfMax = 37;

  const from = Math.floor((bridge.from - 0.01) * track.count);
  const to = Math.ceil((bridge.to + 0.01) * track.count);

  /**
   * 顺着中心线铺一条带子。
   * @param {number} halfWidth 最大半宽
   * @param {number} y 高度
   * @param {THREE.Material} material
   */
  const ribbon = (halfWidth, y, material) => {
    const positions = [];
    const indices = [];
    let vertex = 0;
    let connected = false;

    for (let i = from; i <= to; i++) {
      const idx = ((i % track.count) + track.count) % track.count;
      const deck = track.heightAt(idx / track.count) ?? 0;
      // 桥面低的时候收窄：熔岩从桥底下"长出来"，而不是铺在路面上
      const fade = THREE.MathUtils.clamp((deck - 0.8) / 2.2, 0, 1);
      const half = halfWidth * fade;
      if (half < 0.05) { connected = false; continue; }

      const p = track.points[idx];
      const n = track.normals[idx];
      positions.push(p.x + n.x * half, y, p.z + n.z * half);
      positions.push(p.x - n.x * half, y, p.z - n.z * half);

      if (connected) {
        const a = vertex - 4, b = vertex - 3, c = vertex - 2, d = vertex - 1;
        indices.push(a, b, c, b, d, c);
      }
      vertex += 2;
      connected = true;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  };

  // 河岸：深色的岩壳，比熔岩宽一圈，把熔岩"框"出来
  ribbon(halfMax + 12, 0.08, crustMaterial);
  // 熔岩本体
  ribbon(halfMax, 0.22, lavaMaterial);
  return group;
}

/** 黑曜石：代替草原上的树，一根根尖刺插在焦土上 */
function buildObsidian(scene, track, theme) {
  const objects = [];
  const spots = pickTreeSpots(track, 220);
  if (spots.length === 0) return objects;

  const shardGeometry = new THREE.ConeGeometry(1.6, 9, 5);
  shardGeometry.translate(0, 4.5, 0);
  const mesh = new THREE.InstancedMesh(shardGeometry, toon(theme.treeLeaf), spots.length);
  mesh.castShadow = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  spots.forEach((spot, i) => {
    quaternion.setFromAxisAngle(up, spot.rotation);
    matrix.compose(
      new THREE.Vector3(spot.x, 0, spot.z),
      quaternion,
      new THREE.Vector3(spot.scale * 0.9, spot.scale * 1.6, spot.scale * 0.9),
    );
    mesh.setMatrixAt(i, matrix);
  });

  scene.add(mesh);
  objects.push(mesh);
  return objects;
}

/** 火山口：锥体顶上扣一圈发光的岩浆 */
function buildVolcanoHills(scene, theme) {
  const objects = [];
  const lavaMaterial = new THREE.MeshBasicMaterial({ color: theme.lava });

  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 560 + Math.random() * 460;
    const height = 80 + Math.random() * 170;
    const base = new THREE.Mesh(
      new THREE.ConeGeometry(height * (0.85 + Math.random() * 0.6), height, 7),
      toon(new THREE.Color().setHSL(
        theme.hill.hue,
        theme.hill.sat,
        theme.hill.light + Math.random() * 0.06,
      ).getHex()),
    );
    base.position.set(Math.cos(angle) * radius, height / 2 - 8, Math.sin(angle) * radius);
    scene.add(base);
    objects.push(base);

    // 顶上的火山口
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.13, height * 0.1, 3, 8), lavaMaterial);
    crater.position.set(base.position.x, height - 7, base.position.z);
    scene.add(crater);
    objects.push(crater);
  }
  return objects;
}

/** 灰烬云：又低又脏，飘得比白云慢 */
function buildAshClouds(scene, theme, clouds) {
  const objects = [];
  const puffGeometry = new THREE.SphereGeometry(1, 8, 6);
  const cloudMaterial = toon(theme.ash);

  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set((j - puffs / 2) * 2.2 + Math.random(), Math.random() * 1.4, Math.random() * 1.6);
      puff.scale.setScalar(2.6 + Math.random() * 2.4);
      cloud.add(puff);
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = 120 + Math.random() * 520;
    cloud.position.set(Math.cos(angle) * radius, 45 + Math.random() * 45, Math.sin(angle) * radius);
    cloud.scale.setScalar(2 + Math.random() * 1.6);
    scene.add(cloud);
    clouds.push(cloud);
    objects.push(cloud);
  }
  return objects;
}

/** 飞灰：一点点往上飘的火星，让空气看起来是热的 */
function buildEmbers(scene, theme, embers) {
  const objects = [];
  const material = new THREE.MeshBasicMaterial({ color: theme.lava });

  for (let i = 0; i < 90; i++) {
    const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), material);
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 260;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    ember.position.set(x, Math.random() * 40, z);
    ember.userData = {
      rise: 2.5 + Math.random() * 4.5,
      drift: (Math.random() - 0.5) * 3,
      top: 30 + Math.random() * 40,
      homeX: x,
    };
    scene.add(ember);
    embers.push(ember);
    objects.push(ember);
  }
  return objects;
}
