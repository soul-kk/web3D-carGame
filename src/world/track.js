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
    this.#buildEdgeLines();
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
    const span = eps * this.totalLength;
    const before = this.heightAt(t - eps);
    const after = this.heightAt(t + eps);
    // 断口边上另一侧没有路面：用单侧差分。
    // 【别拿 y 顶替】那样斜率会被砍掉一半，起跳唇看起来 10°，车只吃到 5°。
    if (before === null && after === null) return { y, slope: 0 };
    if (before === null) return { y, slope: (after - y) / span };
    if (after === null) return { y, slope: (y - before) / span };
    return { y, slope: (after - before) / (2 * span) };
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
        const a = vertex - 2, b = vertex - 1, c = vertex, d = vertex + 1;
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

  /** 白色边线：贴着路沿内侧，让"赛道有多宽"一眼可见 */
  #buildEdgeLines() {
    const heightFn = (i, N) => {
      const h = this.heightAt(i / N);
      return h === null ? null : h + 0.015;
    };
    const white = (color) => color.setHex(0xf5f7fa);
    for (const side of [1, -1]) {
      const line = this.#buildRibbon(
        side * (this.halfWidth - 0.3),
        side * this.halfWidth,
        white,
        heightFn,
      );
      line.receiveShadow = false;
      this.group.add(line);
    }
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
        const a = vertex - 2, b = vertex - 1, c = vertex, d = vertex + 1;
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

  /** 黑白格起跑线 + 龙门架。车停在 t=0，线放在车前 6 m —— 正常发车格。 */
  #buildStartLine() {
    const tLine = 6 / this.count;
    const p0 = this.pointAt(tLine);
    const t0 = this.tangentAt(tLine);
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
   * 断桥：一整块连续的桥面 + 两道实心护栏 + 几根桥墩。
   *
   * 【为什么重写】上一版是"路面抬高 + 两侧腹板 + 一排立柱 + 一堆碎板"，
   * 远看像浮在空中的板子，断口处又是一堆乱插的方块。现在桥面本身是一块
   * 闭合的实体断面（顶 / 底 / 两侧 + 断口封口），护栏是连续的墙，
   * 不再有碎板、警戒条、发光条这些零碎件。
   */
  #buildBridge() {
    const b = this.bridge;
    const theme = this.theme;

    /** 桥面比路面低 2 cm：路面仍然是行驶表面，不会和桥面 Z-fighting */
    const DECK_DROP = 0.02;
    /** 桥板厚度 */
    const THICKNESS = 1.6;
    /** 路肩外沿 + 一点挑檐 */
    const halfDeck = this.halfWidth + TRACK.curbWidth + 0.35;
    /** 护栏宽 / 高 */
    const BARRIER_W = 0.45;
    const BARRIER_H = 1.0;

    const deckMaterial = toon(theme.bridgeDeck ?? 0x4a3b3f, { side: THREE.DoubleSide });
    const railMaterial = toon(theme.rail ?? 0xb04a28, { side: THREE.DoubleSide });
    const pierMaterial = toon(0x362b2f);

    const topAt = (h) => h + TRACK.surfaceY - DECK_DROP;

    /** 两段桥面：断口前、断口后。每段两端都封口，塌口就是一个干净的切口。 */
    const spans = [[b.from, b.gapFrom], [b.gapTo, b.to]];

    for (const [from, to] of spans) {
      // 桥面：一整块闭合断面
      this.#addSweptSolid(from, to, (h) => {
        const top = topAt(h);
        return [
          [halfDeck, top],
          [halfDeck, top - THICKNESS],
          [-halfDeck, top - THICKNESS],
          [-halfDeck, top],
        ];
      }, deckMaterial);

      // 护栏：两条连续的实心墙（不再是一根根立柱）
      for (const side of [1, -1]) {
        const center = side * (this.halfWidth + TRACK.curbWidth + 0.22);
        this.#addSweptSolid(from, to, (h) => {
          const base = topAt(h) + 0.01;
          return [
            [center - BARRIER_W / 2, base + BARRIER_H],
            [center + BARRIER_W / 2, base + BARRIER_H],
            [center + BARRIER_W / 2, base],
            [center - BARRIER_W / 2, base],
          ];
        }, railMaterial);
      }
    }

    // 桥墩：一排大墩子撑住整块桥面，断口附近让开
    for (let t = b.from; t <= b.to; t += 0.022) {
      if (t > b.gapFrom - 0.012 && t < b.gapTo + 0.012) continue;
      const h = this.heightAt(t);
      if (h === null || h < 1.5) continue;

      const p = this.pointAt(t);
      const tan = this.tangentAt(t);
      const top = topAt(h) - THICKNESS;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3.6, top, 3.0), pierMaterial);
      pier.position.set(p.x, top / 2, p.z);
      pier.rotation.y = Math.atan2(tan.x, tan.z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      this.group.add(pier);
    }
  }

  /**
   * 把一个闭合断面沿着赛道扫成实体（桥面、护栏都用它）。
   *
   * @param {number} from 起点 t
   * @param {number} to 终点 t
   * @param {(h:number)=>Array<[number,number]>} sectionFn 每个采样点的断面，[横向偏移, 世界 y]
   * @param {THREE.Material} material
   */
  #addSweptSolid(from, to, sectionFn, material) {
    const N = this.count;
    const start = Math.ceil(from * N);
    const end = Math.floor(to * N);
    const rings = [];

    for (let i = start; i <= end; i++) {
      const h = this.heightAt(i / N);
      if (h === null) continue;
      const p = this.points[i % N];
      const n = this.normals[i % N];
      rings.push(sectionFn(h).map(([off, y]) => new THREE.Vector3(
        p.x + n.x * off, y, p.z + n.z * off,
      )));
    }
    if (rings.length < 2) return;

    const M = rings[0].length;
    const positions = [];
    const indices = [];
    for (const ring of rings) for (const v of ring) positions.push(v.x, v.y, v.z);

    for (let r = 0; r < rings.length - 1; r++) {
      const base = r * M;
      const next = (r + 1) * M;
      for (let k = 0; k < M; k++) {
        const k2 = (k + 1) % M;
        indices.push(base + k, base + k2, next + k2);
        indices.push(base + k, next + k2, next + k);
      }
    }

    // 两端封口：断面是凸四边形，扇形三角化
    const capEnd = (rings.length - 1) * M;
    for (let k = 1; k < M - 1; k++) {
      indices.push(0, k, k + 1);
      indices.push(capEnd, capEnd + k + 1, capEnd + k);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
}
