import * as THREE from 'three';
import { TRACK, COLORS } from '../config.js';
import { toon } from '../core/materials.js';
import { createCheckerTexture } from '../core/textures.js';

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
 */
export class Track {
  constructor(scene) {
    /** @type {THREE.CatmullRomCurve3} 中心线闭合曲线 */
    this.curve = new THREE.CatmullRomCurve3(
      TRACK.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,        // closed：首尾相连
      'catmullrom',
      0.5,         // tension：张力，越大越"圆"
    );

    this.count = TRACK.samples;
    this.halfWidth = TRACK.width / 2;
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

    this.group = new THREE.Group();
    this.#buildRoad();
    this.#buildCurbs();
    this.#buildCenterLine();
    this.#buildStartLine();
    scene.add(this.group);
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

  /**
   * 路面：一条三角带（triangle strip）。
   * 对每个采样点取"左边缘 / 右边缘"两个顶点，相邻两组顶点拼成两个三角形。
   *
   * 【顶点顺序很重要】三角形要逆时针面向天空，法线才朝上，否则从上面看会被剔除（不可见）。
   */
  #buildRoad() {
    const N = this.count;
    const positions = [];
    const uvs = [];
    const indices = [];
    const y = TRACK.surfaceY;

    for (let i = 0; i <= N; i++) {
      const p = this.points[i % N];
      const n = this.normals[i % N];
      positions.push(p.x + n.x * this.halfWidth, y, p.z + n.z * this.halfWidth); // 左边
      positions.push(p.x - n.x * this.halfWidth, y, p.z - n.z * this.halfWidth); // 右边
      const v = (i * this.spacing) / 8;  // 让贴图沿路重复
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const road = new THREE.Mesh(geometry, toon(COLORS.road, { side: THREE.DoubleSide }));
    road.receiveShadow = true;
    this.group.add(road);
  }

  /** 路肩：颜色随采样点下标交替，形成红白条纹 */
  #buildCurbs() {
    const curbColor = (color, i) => color.setHex(Math.floor(i / 7) % 2 ? COLORS.curbB : COLORS.curbA);
    const left = this.#buildRibbon(this.halfWidth, this.halfWidth + TRACK.curbWidth, TRACK.surfaceY + 0.02, curbColor);
    const right = this.#buildRibbon(-this.halfWidth, -this.halfWidth - TRACK.curbWidth, TRACK.surfaceY + 0.02, curbColor);
    left.receiveShadow = right.receiveShadow = true;
    this.group.add(left, right);
  }

  /**
   * 通用"带状几何体"：在中心线两侧指定偏移处各生成一排顶点。
   * 路肩、以及任何沿赛道铺的长条都能用它。
   */
  #buildRibbon(innerOffset, outerOffset, y, colorFn) {
    const N = this.count;
    const positions = [];
    const colors = [];
    const indices = [];
    const color = new THREE.Color();

    for (let i = 0; i <= N; i++) {
      const p = this.points[i % N];
      const n = this.normals[i % N];
      positions.push(p.x + n.x * innerOffset, y, p.z + n.z * innerOffset);
      positions.push(p.x + n.x * outerOffset, y, p.z + n.z * outerOffset);
      colorFn(color, i);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
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
    const mesh = new THREE.InstancedMesh(geometry, toon(0xf2f4f8), params.length);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const zAxis = new THREE.Vector3(0, 0, 1);

    params.forEach((t, i) => {
      const p = this.pointAt(t);
      const tan = this.tangentAt(t);
      // 把方块默认的 +Z 朝向旋转到赛道前进方向
      quaternion.setFromUnitVectors(zAxis, tan);
      matrix.compose(new THREE.Vector3(p.x, TRACK.surfaceY + 0.02, p.z), quaternion, scale);
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
      new THREE.PlaneGeometry(TRACK.width, 3.4),
      new THREE.MeshBasicMaterial({ map: createCheckerTexture() }),
    );
    line.rotation.x = -Math.PI / 2;   // 平面默认竖着，绕 X 转 -90° 放平
    line.rotation.z = heading;        // 平面自身的 z 轴就是它的法线，正是"在路面内旋转"
    line.position.set(p0.x, TRACK.surfaceY + 0.04, p0.z);
    this.group.add(line);

    const gantry = new THREE.Group();
    const white = toon(0xf5f7fa);
    const red = toon(COLORS.curbA);

    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 10, 0.7), white);
      post.position.set(side * (this.halfWidth + 2), 5, 0);
      post.castShadow = true;
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK.width + 5, 1.1, 0.8), red);
    beam.position.y = 10.3;
    beam.castShadow = true;
    gantry.add(beam);

    gantry.position.set(p0.x, 0, p0.z);
    gantry.rotation.y = heading;
    this.group.add(gantry);
  }
}
