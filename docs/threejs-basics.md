# Three.js 基础概念速查（配本项目代码）

> 给完全没有 3D 前端基础的人。每个概念都给出了**本项目里对应的文件**，
> 建议打开代码对着看，比只看文档快十倍。

---

## 1. 3D 世界是怎么显示到屏幕上的

一句话：**场景（scene）里的物体，被相机（camera）看到，由渲染器（renderer）画成一张图。**

```js
renderer.render(scene, camera);   // src/core/app.js
```

三个核心对象：

| 对象 | 是什么 | 本项目位置 |
| --- | --- | --- |
| `Scene` | 一个容器（3D 版的 `<div>`），所有东西都得 `scene.add(...)` 进去 | `core/app.js` |
| `Camera` | 观察者的眼睛，决定"从哪看、看多宽" | `core/app.js`（透视相机 PerspectiveCamera） |
| `WebGLRenderer` | 真正调用 GPU 作画的画笔，画布就是页面里那个 `<canvas>` | `core/app.js` |

**渲染循环**：浏览器每秒调用约 60 次 `requestAnimationFrame`，我们每次画一帧，
物体一点点移动累积起来就成了动画。Three.js 封装成了：

```js
renderer.setAnimationLoop(() => { ... });   // src/core/app.js
```

---

## 2. 坐标系：右手坐标系，Y 轴朝上

```
        +Y（上）
         |
         |
         +-------- +X（右）
        /
      +Z（朝向屏幕外，也就是"玩家面前"）
```

- 本项目的赛车场铺在 **XZ 平面**上（地面），所以"位置"常常只关心 `(x, z)`。
- 角度用**弧度**，不是度数。`Math.PI` = 180°。
- **朝向角**约定：`forward = (sin(θ), 0, cos(θ))`，这样 `θ = 0` 时车头朝 +Z。
  从坐标反推角度用 `Math.atan2(dx, dz)`（注意是 `x` 在前，`z` 在后）。

> 代码位置：`world/track.js` 里 `Math.atan2(t0.x, t0.z)`；`game/car.js` 的 `get forward()`。

**Vector3 / Vector2**：`THREE.Vector3` 是 `{x, y, z}`，`Vector2` 是 `{x, y}`。
本项目用 `Vector2` 表示地面上的速度，其中 **`y` 存的是世界的 `z`**（`game/car.js` 有注释标注）。

常用向量运算：

| 运算 | 含义 | 例子 |
| --- | --- | --- |
| `a.dot(b)` | 点积 → 判断同向/垂直/反向，或求投影长度 | 车辆速度在车头方向上的分量 |
| `a.cross(b)` | 叉积 → 求两个向量构成的平面的法线 | 由切线求路面左右方向 |
| `a.normalize()` | 变成长度 1 的单位向量，只保留方向 | |
| `a.distanceTo(b)` | 两点距离 | 判断是否吃到金币 |

---

## 3. 场景图（Scene Graph）

`scene` 是一棵树。给一个 `Group` 设置位置/旋转，里面所有子物体都会跟着动。

```
scene
├── ground / road / trees ...          ← world/ 里创建
└── car.root                           ← 车的位置和朝向挂在这层
      ├── chassis                      ← 只承载"侧倾/俯仰"，不影响轮子
      │     ├── 车身 Box
      │     └── 描边副本
      └── wheelPivot × 4               ← 转向轴
            └── tyre / rim             ← 只负责滚动
```

**为什么轮子不挂在 `chassis` 下？** 因为 `chassis` 会随转弯侧倾，轮子应该老老实实贴着地。

> 代码位置：`game/car.js` 的 `#buildModel()`。

三种变换：

| 属性 | 含义 | 单位 |
| --- | --- | --- |
| `position` | 位置 | 世界单位（≈米） |
| `rotation` | 旋转（欧拉角） | 弧度 |
| `scale` | 缩放 | 倍数 |

---

## 4. 几何体与材质

- **Geometry（几何体）**= 形状（顶点数据）。如 `BoxGeometry`（盒子）、`ConeGeometry`（圆锥）、
  `SphereGeometry`（球）、`PlaneGeometry`（平面）。
- **Material（材质）**= 表面长什么样。如 `MeshBasicMaterial`（不受光照）、
  `MeshStandardMaterial`（PBR 写实）、**`MeshToonMaterial`（本项目用的卡通材质）**。
- **Mesh = Geometry + Material**，这才是能加到场景里的东西。

```js
const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), toon(0xff4d5a));
mesh.position.set(0, 0.5, 0);
scene.add(mesh);
```

> 微优化：几何体可以在多个 Mesh 之间共享（本项目金币、树都共享同一份几何体），
> 省显存也省创建开销。

### 自定义几何体

路面不是现成的形状，而是自己填顶点数组拼出来的：

```js
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
geometry.setIndex(indices);          // 哪些顶点组成三角形
geometry.computeVertexNormals();     // 自动算法线
```

> 代码位置：`world/track.js` 的 `#buildRoad()` / `#buildRibbon()`。
> **顶点顺序**决定三角形朝向，顺序反了会被背面剔除看不见 —— 这是新手最常踩的坑。

---

## 5. 光照与阴影

光照类型（`core/app.js`）：

| 类型 | 特点 | 本项目用途 |
| --- | --- | --- |
| `HemisphereLight` | 天空色 + 地面色的环境光，无方向 | 打底，避免暗部死黑 |
| `DirectionalLight` | 平行光，模拟太阳 | 主光 + 投影阴影 |

开启阴影三件套：

```js
renderer.shadowMap.enabled = true;   // 渲染器开阴影
sunLight.castShadow = true;          // 光源要投影
mesh.castShadow = true;              // 物体要投影
ground.receiveShadow = true;         // 地面要接收阴影
```

**阴影贴图分辨率有限**，只覆盖光源周围一小块。所以本项目让太阳光**跟着赛车移动**
（`game/game.js` 的 `#updateSun()`），而不是照亮整个 4000×4000 的草地。

---

## 6. 贴图（Texture）

本项目不加载任何图片文件，所有贴图都用 `<canvas>` 现场画出来：

```js
const canvas = document.createElement('canvas');
ctx.fillStyle = '#19c6ff'; ...
const texture = new THREE.CanvasTexture(canvas);   // 起跑线、加速带箭头
```

还有一张特殊的一维贴图 —— **色阶贴图**，它决定了卡通材质有几个明暗层次：

```js
const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);  // core/textures.js
```

---

## 7. 曲线：让赛道"画"出来

`CatmullRomCurve3` 会穿过你给的控制点，生成一条平滑曲线（`world/track.js`）：

```js
const curve = new THREE.CatmullRomCurve3(points, true /* 闭合 */, 'catmullrom', 0.5);
curve.getPointAt(t)     // t ∈ [0,1)，按"弧长"均匀取点 —— 生成路面用这个
curve.getTangentAt(t)   // 该点的前进方向
```

曲线本身看不见，我们沿它取 1200 个采样点，相邻点连线成三角带，才成了路面。

---

## 8. 每帧更新：`dt` 与插值

```js
const dt = clock.getDelta();          // 距上一帧的秒数
object.position.x += speed * dt;      // 速度 × 时间 = 位移
```

**永远不要写 `position.x += 1`**，那样电脑越快车越快。所有变化都要乘 `dt`。

平滑跟随（相机、转向）用指数插值，它是帧率无关的：

```js
value += (target - value) * (1 - Math.exp(-k * dt));   // 或用 Vector3.lerp
```

---

## 9. 性能常识（从小游戏就会遇到）

| 手段 | 说明 | 本项目位置 |
| --- | --- | --- |
| `InstancedMesh` | 同一模型画几百份，只需 1 次绘制调用 | 树木、中线虚线 |
| 共享几何体 / 材质 | 金币 30 个共用一份 | `world/props.js` |
| 对象池 | 粒子用完隐藏而不是销毁重建，避免 GC 卡顿 | `fx/particles.js` |
| 三角形数量要低 | 球体分段数 8 而不是 64，低模还很"卡通" | `world/environment.js` |
| 控制阴影范围 | 只覆盖相机附近 | `WORLD.shadowRadius` |
| 少改材质属性 | 每帧改 `material.opacity` 会触发上传，但本项目粒子数量少可接受 | `fx/particles.js` |

看性能：`renderer.info.render.calls`（绘制次数）、`triangles`（三角形数），
或用浏览器扩展 **Spector.js** 抓一帧看看。

---

## 10. 名词对照表

| 英文 | 中文 | 一句话解释 |
| --- | --- | --- |
| Scene / Camera / Renderer | 场景 / 相机 / 渲染器 | 有什么 / 从哪看 / 谁来画 |
| Mesh | 网格 | 几何体 + 材质，可渲染物体 |
| Geometry | 几何体 | 形状，由顶点和三角形构成 |
| Material | 材质 | 表面外观（颜色、贴图、光照反应） |
| Shader | 着色器 | 跑在 GPU 上的小程序，决定每个像素怎么上色 |
| UV | 纹理坐标 | 贴图怎么贴到模型上，(0,0)~(1,1) |
| Normal | 法线 | 表面朝向，决定光照亮暗 |
| Draw Call | 绘制调用 | CPU 通知 GPU 画一次，越少越好 |
| FOV | 视野角 | 相机能看到的张角，越大越"广角" |
| LOD | 多级细节 | 远的物体用低模 |
| glTF (.glb) | 3D 模型格式 | Web 界的 "JPEG"，Blender 可导出 |

---

下一步 → [`learning-path.md`](learning-path.md)
