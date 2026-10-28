import * as THREE from 'three';
import { TRACK } from '../config.js';
import { toon } from '../core/materials.js';
import { createCheckerTexture } from '../core/textures.js';

/** 平滑曲线：t∈[0,1] → 0~1，两端斜率为 0，用来做坡道 */
function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * 控制点有两种写法，这里统一成 [[x, z], ...]：
 *   - 嵌套数组：[[x, z], [x, z], ...]
 *   - 扁平数组：[x, z, x, z, ...]（生成的赛道有上百个点，扁平写法省一半行数）
 * @param {Array} points
 * @returns {Array<[number, number]>}
 */
function normalizeControlPoints(points) {
  if (!points?.length) return [];
  if (Array.isArray(points[0])) return points;
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

/**
 * 赛道。
 *
 * 【3D 基础知识】
 * 1. 世界坐标系：本项目的赛车场铺在 XZ 平面上，Y 轴向上（右手坐标系）。
 *    所以"位置"用 (x, z) 就能描述地面上的点，y 只用来控制高度。
 * 2. 曲线：用 CatmullRomCurve3 穿过一组控制点，生成一条平滑的闭合曲线，
 *    这条曲线就是赛道中心线。它既能用来铺路面，也能用来判断赛车"是否在赛道内"。
 * 3. 采样：曲线是数学对象，没法直接画。我们沿曲线均匀取 N 个点（this.points），
 *    再把相邻点连成三角带，就得到了看得见的路面。
 *
 * 【断桥是怎么做的】
 * 赛道不一定都是平的：地图可以给一段路指定"高度"，让它架在空中（桥），
 * 甚至在桥中间挖一个口子（断口）。路面生成时遇到断口就断开，
 * 于是那里真的没有桥面 —— 车冲上起跳唇就能飞过去，掉下去就沉了。
 */
export class Track {
  /**
   * @param {THREE.Scene} scene
   * @param {object} config 地图配置：{ id, controlPoints, width, theme, bridge }
   */
  constructor(scene, config) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.applyConfig(config);
  }

  /**
   * 换一张地图：重建中心线、采样点和所有可见几何体。
   * @param {object} config 地图配置
   */
  applyConfig(config) {
    this.config = config;
    this.theme = config.theme;
    this.id = config.id;
    /** 断桥规格（没有桥的地图这里是 null） */
    this.bridge = config.bridge ?? null;

    /** @type {THREE.CatmullRomCurve3} 中心线闭合曲线 */
    this.curve = new THREE.CatmullRomCurve3(
      normalizeControlPoints(config.controlPoints).map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,        // closed：首尾相连
      'catmullrom',
      0.5,         // tension：张力，越大越"圆"
    );

    this.count = TRACK.samples;
    this.halfWidth = (config.width ?? TRACK.width) / 2;
    this.totalLength = this.curve.getLength();
    this.spacing = this.totalLength / this.count;

    /** 中心线上的均匀采样点 */
    this.points = [];
    /** 每个采样点处的切线（前进方向，已归一化，y 恒为 0） */
    this.tangents = [];
    /** 每个采样点处的水平法线，用来把路面"往左右两边撑开" */
    this.normals = [];

    for (let i = 0; i < this.count; i++) {
      this.points.push(this.curve.getPointAt(i / this.count));
    }
    for (let i = 0; i < this.count; i++) {
      const prev = this.points[(i - 1 + this.count) % this.count];
      const next = this.points[(i + 1) % this.count];
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      this.tangents.push(tangent);
      // 把切线绕 Y 轴转 90°：(tx,0,tz) → (tz,0,-tx)
      this.normals.push(new THREE.Vector3(tangent.z, 0, -tangent.x));
    }

    this.#clearMeshes();
    this.#buildRoad();
    this.#buildCurbs();
    this.#buildCenterLine();
    this.#buildStartLine();
    if (this.bridge) this.#buildBridge();
  }

  /* ================= 高度（断桥用） ================= */

  /**
   * 赛道在参数 t 处的高度。
   * @param {number} t 曲线参数 ∈[0,1)
   * @returns {number|null} null 表示"脚下没有地面"（断口正上方）
   */
  heightAt(t) {
    const b = this.bridge;
    if (!b) return 0;
    const tt = ((t % 1) + 1) % 1;
    if (tt < b.from || tt > b.to) return 0;
    if (tt >= b.gapFrom && tt <= b.gapTo) return null;   // 塌掉的那一段

    if (tt < b.gapFrom) {
      // 上桥的坡道
      const p = (tt - b.from) / (b.gapFrom - b.from);
      const base = smoothstep(p) * b.height;
      // 桥末端翘起的"起跳唇"：把水平速度换成上升速度
      const kickStart = b.gapFrom - 0.03;
      if (tt > kickStart) {
        const k = (tt - kickStart) / (b.gapFrom - kickStart);
        return base + k * k * 3.4;
      }
      return base;
    }

    // 落地段：从桥面高度斜着落回地面
    const p = (tt - b.gapTo) / (b.to - b.gapTo);
    return b.height * (1 - smoothstep(p));
  }

  /**
   * 路面高度 + 坡度。
   * @param {number} t 曲线参数
   * @returns {{y:number|null, slope:number}} slope 是"每前进一个单位上升多少"
   */
  surfaceAt(t) {
    const y = this.heightAt(t);
    if (y === null) return { y: null, slope: 0 };
    const eps = 0.0015;
    const before = this.heightAt(t - eps);
    const after = this.heightAt(t + eps);
    const a = before === null ? y : before;
    const b = after === null ? y : after;
    return { y, slope: (b - a) / (2 * eps * this.totalLength) };
  }

  /* ================= 查询接口 ================= */

  /** 曲线参数 t∈[0,1) → 中心线上的点 */
  pointAt(t) { return this.curve.getPointAt(((t % 1) + 1) % 1); }
  /** 曲线参数 t → 前进方向单位向量 */
  tangentAt(t) {
    const tan = this.curve.getTangentAt(((t % 1) + 1) % 1);
    return new THREE.Vector3(tan.x, 0, tan.z).normalize();
  }
  /** 曲线参数 t → 水平法线方向 */
  normalAt(t) {
    const tan = this.tangentAt(t);
    return new THREE.Vector3(tan.z, 0, -tan.x);
  }

  /** 采样点下标 → 赛道进度（0 起点，1 终点），用来判断是否跑完一圈 */
  progressOf(index) { return index / this.count; }

  /**
   * 找出离 (x, z) 最近的赛道采样点。
   *
   * 这是"赛车是否压到草地"和"跑了多远"的唯一依据。
   * 为了性能我们不做全量遍历：以上一帧的位置为线索，只在小窗口里搜索。
   *
   * @param {number} x
   * @param {number} z
   * @param {number} [hint] 上一帧的下标，作为搜索起点
   * @returns {{index:number, distance:number, tangent:THREE.Vector3}}
   */
  nearest(x, z, hint = 0) {
    const N = this.count;
    let bestIndex = hint;
    let bestDistSq = Infinity;

    const scan = (start, length) => {
      for (let k = 0; k < length; k++) {
        const i = ((start + k) % N + N) % N;
        const dx = x - this.points[i].x;
        const dz = z - this.points[i].z;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIndex = i;
        }
      }
    };

    // 在上一帧位置前后各 60 个采样点内找（约 ±38 个世界单位）
    scan(hint - 60, 121);
    // 线索失效（比如开了 R 键重置、或冲出赛道太远）→ 老实全扫一遍
    if (bestDistSq > 900) {
      bestDistSq = Infinity;
      scan(0, N);
    }

    return {
      index: bestIndex,
      distance: Math.sqrt(bestDistSq),
      tangent: this.tangents[bestIndex],
    };
  }

  /* ================= 几何体构建 ================= */

  /** 换地图时把旧几何体清干净，避免显存越用越多 */
  #clearMeshes() {
    for (const child of [...this.group.children]) {
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
      this.group.remove(child);
    }
  }

  /**
   * 路面：一条三角带（triangle strip）。
   * 对每个采样点取"左边缘 / 右边缘"两个顶点，相邻两组顶点拼成两个三角形。
   *
   * 【顶点顺序很重要】三角形要逆时针面向天空，法线才朝上，否则从上面看会被剔除（不可见）。
   * 【断口】遇到没有地面的一格就断开，不生成跨越断口的三角形 —— 于是那里真的缺一块。
   */
  #buildRoad() {
    const N = this.count;
    const positions = [];
    const uvs = [];
    const indices = [];
    let vertex = 0;
    let connected = false;

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const height = this.heightAt(t);
      if (height === null) { connected = false; continue; }

      const p = this.points[i % N];
      const n = this.normals[i % N];
      const y = TRACK.surfaceY + height;
      positions.push(p.x + n.x * this.halfWidth, y, p.z + n.z * this.halfWidth); // 左边
      positions.push(p.x - n.x * this.halfWidth, y, p.z - n.z * this.halfWidth); // 右边
      const v = (i * this.spacing) / 8;  // 让贴图沿路重复
      uvs.push(0, v, 1, v);

      if (connected) {
        const a = vertex - 4, b = vertex - 3, c = vertex - 2, d = vertex - 1;
        indices.push(a, b, c, b, d, c);
      }
      vertex += 2;
      connected = true;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const road = new THREE.Mesh(geometry, toon(this.theme.road, { side: THREE.DoubleSide }));
    road.receiveShadow = true;
    this.group.add(road);
  }

  /** 路肩：颜色随采样点下标交替，形成红白条纹 */
  #buildCurbs() {
    const curbColor = (color, i) => color.setHex(Math.floor(i / 7) % 2 ? this.theme.curbB : this.theme.curbA);
    const heightFn = (i, N) => this.heightAt(i / N);
    const left = this.#buildRibbon(this.halfWidth, this.halfWidth + TRACK.curbWidth, curbColor, heightFn);
    const right = this.#buildRibbon(-this.halfWidth, -this.halfWidth - TRACK.curbWidth, curbColor, heightFn);
    left.receiveShadow = right.receiveShadow = true;
    this.group.add(left, right);
  }

  /**
   * 通用"带状几何体"：在中心线两侧指定偏移处各生成一排顶点。
   * 路肩、以及任何沿赛道铺的长条都能用它。
   *
   * @param {number} innerOffset 内侧偏移
   * @param {number} outerOffset 外侧偏移
   * @param {(color:THREE.Color, i:number)=>void} colorFn 逐点着色
   * @param {(i:number, n:number)=>number|null} [heightFn] 逐点高度，null 表示断开
   */
  #buildRibbon(innerOffset, outerOffset, colorFn, heightFn = null) {
    const N = this.count;
    const positions = [];
    const colors = [];
    const indices = [];
    const color = new THREE.Color();
    let vertex = 0;
    let connected = false;

    for (let i = 0; i <= N; i++) {
      const height = heightFn ? heightFn(i, N) : 0;
      if (height === null) { connected = false; continue; }

      const p = this.points[i % N];
      const n = this.normals[i % N];
      const y = TRACK.surfaceY + height;
      positions.push(p.x + n.x * innerOffset, y, p.z + n.z * innerOffset);
      positions.push(p.x + n.x * outerOffset, y, p.z + n.z * outerOffset);
      colorFn(color, i);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);

      if (connected) {
        const a = vertex - 4, b = vertex - 3, c = vertex - 2, d = vertex - 1;
        indices.push(a, b, c, b, d, c);
      }
      vertex += 2;
      connected = true;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return new THREE.Mesh(geometry, toon(0xffffff, {
      vertexColors: true,        // 颜色来自顶点属性而非材质
      side: THREE.DoubleSide,    // 左右两条路肩的顶点顺序相反，用双面渲染省事
    }));
  }

  /**
   * 中线虚线。
   * 【InstancedMesh】同样的小方块要画几百个，逐个建 Mesh 会有几百次 draw call。
   * 实例化渲染把"一份几何体 + 一堆变换矩阵"一次性提交，性能好得多。
   */
  #buildCenterLine() {
    const params = [];
    for (let d = 12; d < this.totalLength - 12; d += 9) params.push(d / this.totalLength);

    const geometry = new THREE.BoxGeometry(0.4, 0.02, 3);
    const mesh = new THREE.InstancedMesh(geometry, toon(this.theme.centerLine), params.length);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const zAxis = new THREE.Vector3(0, 0, 1);

    params.forEach((t, i) => {
      const p = this.pointAt(t);
      const tan = this.tangentAt(t);
      const height = this.heightAt(t);
      if (height === null) return;   // 断口上没有中线
      // 把方块默认的 +Z 朝向旋转到赛道前进方向
      quaternion.setFromUnitVectors(zAxis, tan);
      matrix.compose(new THREE.Vector3(p.x, TRACK.surfaceY + height + 0.02, p.z), quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });

    this.group.add(mesh);
  }

  /** 黑白格起跑线 + 龙门架 */
  #buildStartLine() {
    const p0 = this.points[0];
    const t0 = this.tangents[0];
    const heading = Math.atan2(t0.x, t0.z);   // 朝向角 = atan2(x分量, z分量)

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.halfWidth * 2, 3.4),
      new THREE.MeshBasicMaterial({ map: createCheckerTexture() }),
    );
    line.rotation.x = -Math.PI / 2;   // 平面默认竖着，绕 X 转 -90° 放平
    line.rotation.z = heading;        // 平面自身的 z 轴就是它的法线，正是"在路面内旋转"
    line.position.set(p0.x, TRACK.surfaceY + 0.04, p0.z);
    this.group.add(line);

    const gantry = new THREE.Group();
    const white = toon(0xf5f7fa);
    const red = toon(this.theme.curbA);

    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 10, 0.7), white);
      post.position.set(side * (this.halfWidth + 2), 5, 0);
      post.castShadow = true;
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(this.halfWidth * 2 + 5, 1.1, 0.8), red);
    beam.position.y = 10.3;
    beam.castShadow = true;
    gantry.add(beam);

    gantry.position.set(p0.x, 0, p0.z);
    gantry.rotation.y = heading;
    this.group.add(gantry);
  }

  /**
   * 断桥的"骨头"：桥腹板、护栏、桥墩、还有断口两边的碎板和警示条。
   *
   * 【为什么桥面之外还要这些】光有一块浮空的路面板，玩家根本看不出
   * "这是一座桥"，也不知道桥下面是什么 —— 之前就是这么反馈的：
   * "断桥部分都看不到桥在哪，整个车浮空了"。
   * 桥墩和护栏给出尺度感，腹板给桥面厚度，
   * 碎掉的板子和警示条则明确地告诉玩家"这里塌了，冲过去"。
   */
  #buildBridge() {
    const b = this.bridge;
    const theme = this.theme;
    /** 护栏用警戒色（熔岩图是橙红），一眼能看出"这是高架" */
    const railColor = theme.rail ?? theme.curbA;
    /** 腹板 / 桥墩：比路面暗一号的岩色 */
    const beamMaterial = toon(0x3c2f34);
    const pierMaterial = toon(0x4a3b3f);

    /** 桥面边缘（路肩外沿） */
    const edge = this.halfWidth + TRACK.curbWidth;

    /* 1. 桥腹板：沿两侧竖起来的板子，给桥面 1.8 m 的厚度 */
    for (const side of [1, -1]) {
      const fascia = this.#buildVerticalRibbon(
        side * edge,
        (i, N) => {
          const h = this.heightAt(i / N);
          return h === null ? null : h + TRACK.surfaceY;
        },
        (i, N) => {
          const h = this.heightAt(i / N);
          return h === null ? null : h + TRACK.surfaceY - 1.8;
        },
      );
      fascia.material = beamMaterial;
      fascia.castShadow = true;
      this.group.add(fascia);
    }

    /* 2. 护栏：立在腹板外侧的高条 + 每隔几米一根立柱 */
    for (const side of [1, -1]) {
      const rail = this.#buildVerticalRibbon(
        side * (edge + 0.18),
        (i, N) => {
          const h = this.heightAt(i / N);
          return h === null ? null : h + TRACK.surfaceY + 1.5;
        },
        (i, N) => {
          const h = this.heightAt(i / N);
          return h === null ? null : h + TRACK.surfaceY;
        },
      );
      rail.material = toon(railColor);
      this.group.add(rail);

      // 立柱：让护栏有"一格一格"的节奏，而不是一条贴纸
      const postGeometry = new THREE.BoxGeometry(0.34, 1.6, 0.34);
      for (let t = b.from; t <= b.to; t += 0.008) {
        const h = this.heightAt(t);
        if (h === null || h < 0.6) continue;
        const p = this.pointAt(t);
        const n = this.normalAt(t);
        const post = new THREE.Mesh(postGeometry, toon(0x2f2429));
        post.position.set(
          p.x + n.x * side * (edge + 0.18),
          h + TRACK.surfaceY + 0.8,
          p.z + n.z * side * (edge + 0.18),
        );
        post.castShadow = true;
        this.group.add(post);
      }
    }

    /* 3. 桥墩：粗墩子 + 顶上的横梁（把两侧的墩子连起来） */
    for (let t = b.from; t <= b.to; t += 0.012) {
      if (t > b.gapFrom - 0.012 && t < b.gapTo + 0.012) continue;
      const height = this.heightAt(t);
      if (height === null || height < 1.2) continue;

      const p = this.pointAt(t);
      const n = this.normalAt(t);
      const tan = this.tangentAt(t);
      const heading = Math.atan2(tan.x, tan.z);

      for (const side of [1, -1]) {
        const pier = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, height + TRACK.surfaceY, 3.2),
          pierMaterial,
        );
        pier.position.set(
          p.x + n.x * side * (this.halfWidth - 0.6),
          (height + TRACK.surfaceY) / 2,
          p.z + n.z * side * (this.halfWidth - 0.6),
        );
        pier.castShadow = true;
        this.group.add(pier);
      }

      // 横梁：横跨整个桥面宽度的盖梁
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth * 2 + 1.2, 1.1, 2.4),
        beamMaterial,
      );
      cap.position.set(p.x, height + TRACK.surfaceY - 1.9, p.z);
      cap.rotation.y = heading;
      cap.castShadow = true;
      this.group.add(cap);
    }

    /* 4. 断口警戒带：断口前后各铺一段"警戒色 + 深色"交替的路面条 */
    this.#buildHazardStrip(b.gapFrom - 0.013, b.gapFrom, railColor);
    this.#buildHazardStrip(b.gapTo, b.gapTo + 0.013, railColor);

    /* 5. 断口边缘的发光条：熔岩图里雾很浓，普通颜色看不清"这里没有桥面" */
    const glowMaterial = new THREE.MeshBasicMaterial({ color: theme.lava ?? 0xff6a1a });
    for (const [edgeT, direction] of [[b.gapFrom, -1], [b.gapTo, 1]]) {
      const p = this.pointAt(edgeT);
      const tan = this.tangentAt(edgeT);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth * 2, 0.5, 0.7),
        glowMaterial,
      );
      glow.position.set(p.x, TRACK.surfaceY + (this.heightAt(edgeT) ?? 0) - 0.1, p.z);
      glow.rotation.y = Math.atan2(tan.x, tan.z);
      this.group.add(glow);
    }

    // 断口两边的碎板：斜插着的木板，一眼就知道"这里断了"
    for (const [edgeT, direction] of [[b.gapFrom, -1], [b.gapTo, 1]]) {
      for (let k = 0; k < 5; k++) {
        const t = edgeT + direction * k * 0.0016;
        const height = this.heightAt(t) ?? b.height;
        const p = this.pointAt(t);
        const n = this.normalAt(t);
        const shard = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 2.6, 3.2),
          toon(0x3a2c30),
        );
        shard.position.set(
          p.x + n.x * (k - 2) * 2.6,
          TRACK.surfaceY + height + 0.4 + k * 0.25,
          p.z + n.z * (k - 2) * 2.6,
        );
        shard.rotation.set(0.5 + k * 0.12, Math.atan2(this.tangentAt(t).x, this.tangentAt(t).z), 0.3 * k);
        shard.castShadow = true;
        this.group.add(shard);
      }
    }
  }

  /**
   * 竖直的带状几何体：沿着赛道两侧立起来的一片（护栏、腹板都用它）。
   *
   * @param {number} offset 相对中心线的横向偏移
   * @param {(i:number,n:number)=>number|null} topFn 每个采样点的顶边高度，null 表示断开
   * @param {(i:number,n:number)=>number|null} bottomFn 底边高度
   */
  #buildVerticalRibbon(offset, topFn, bottomFn) {
    const N = this.count;
    const positions = [];
    const indices = [];
    let vertex = 0;
    let connected = false;

    for (let i = 0; i <= N; i++) {
      const top = topFn(i, N);
      const bottom = bottomFn(i, N);
      if (top === null || bottom === null) { connected = false; continue; }

      const p = this.points[i % N];
      const n = this.normals[i % N];
      positions.push(p.x + n.x * offset, top, p.z + n.z * offset);
      positions.push(p.x + n.x * offset, bottom, p.z + n.z * offset);

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

    return new THREE.Mesh(geometry, toon(0xffffff, { side: THREE.DoubleSide }));
  }

  /**
   * 铺在路面上的"警戒条"：警戒色和深色交替的一段路面。
   * 用在断口前后 —— 让玩家在开上去之前就知道"前面没有桥面了"。
   */
  #buildHazardStrip(from, to, color) {
    const strip = this.#buildRibbon(
      -this.halfWidth, this.halfWidth,
      (c, i) => c.setHex(Math.floor(i / 4) % 2 ? 0x241b1f : color),
      (i, N) => {
        const t = i / N;
        if (t < from || t > to) return null;
        const h = this.heightAt(t);
        return h === null ? null : h + 0.02;
      },
    );
    strip.material = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
    this.group.add(strip);
  }
}
