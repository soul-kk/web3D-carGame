# Web 3D 学习路线图（零基础 → 能独立做项目）

> 面向"会一点前端，但没碰过 3D"的人。全程约 **3～6 个月**（每天 1 小时左右）。
> 核心原则：**项目驱动**。不要先把数学和图形学学完再动手，那样 90% 的人会半路放弃。
>
> 这份路线图和你手上这个赛车项目是配套的：每学一块，就回来改一遍赛车，立刻能看到效果。

---

## 阶段 0 · 地基（1～2 周）

**目标：能看懂本项目的 JS，能跑起来并改出效果。**

- [ ] 现代 JS：`import / export` 模块、箭头函数、解构、`class`、`Map`、可选链 `?.`
- [ ] 异步：`Promise`、`async/await`（以后加载模型要用）
- [ ] npm 基础：`npm install` / `npm run dev`，知道 `package.json` 是干嘛的
- [ ] 浏览器开发者工具：Console、Network、性能面板；学会用 `console.log` 和断点
- [ ] 矢量基础：坐标、向量加减、长度、**点积**

**练习**：把 `src/config.js` 里所有参数各改一遍，观察画面变化。

**验收**：能说清 `main.js → game.js → car.js` 的调用关系。

📚 资源
- MDN 中文 <https://developer.mozilla.org/zh-CN/docs/Web/JavaScript>
- 现代 JavaScript 教程 <https://zh.javascript.info/>

---

## 阶段 1 · Three.js 最小可用（2～3 周）

**目标：脱离赛车项目，自己能从零写一个"旋转的立方体 + 光照 + 相机控制"。**

必学的 6 件事（按顺序）：

1. **三件套**：`Scene` / `Camera` / `WebGLRenderer`，以及 `renderer.setAnimationLoop`
2. **坐标系**：Y 轴朝上的右手系、弧度、`position/rotation/scale`
3. **几何体 + 材质 + 网格**：`BoxGeometry`、`MeshStandardMaterial`、`Mesh`
4. **光照**：环境光 / 平行光 / 点光，以及阴影的三个开关
5. **控制器**：`OrbitControls`（鼠标转场景，调试必备）
6. **贴图与 UV**：加载一张图片贴到平面上

```js
// 这 12 行就是 Web 3D 的 "Hello World"
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 2, 6);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x44aa88 }),
);
scene.add(cube);
scene.add(new THREE.DirectionalLight(0xffffff, 2));
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;      // 以后记得改成 * dt
  renderer.render(scene, camera);
});
```

**练习**（每个都动手写，不要复制粘贴）
- [ ] 立方体自转 + 一个环绕它的球 + 地面 + 阴影
- [ ] 用 `OrbitControls` 自由观察；给物体加 `dat.gui` / `lil-gui` 调参数
- [ ] 一个"太阳系"：地球绕太阳转，月球绕地球转（练**父子关系/场景图**）
- [ ] 相机跟随一个移动的方块（练**每帧更新**）

**验收**：能不看教程写出上面 12 行，并解释 `dt` 为什么必须乘。

📚 资源（挑一个主看，别贪多）
- **官方手册（有中文）** <https://threejs.org/manual/#zh/fundamentals> ← 首选，短小精悍
- 官方文档 <https://threejs.org/docs/> ← 当字典查
- 官方示例 <https://threejs.org/examples/> ← 每个特性都有可运行 demo + 源码
- Discover three.js <https://discoverthreejs.com/> ← 免费在线书，讲得系统
- Three.js Journey <https://threejs-journey.com/> ← **付费**，公认最系统，预算够就上

---

## 阶段 2 · 拆解这个赛车项目（1～2 周）

**目标：把这个项目彻底读明白，并改出属于自己的版本。**

按这个顺序读（每个文件都对照着 `docs/threejs-basics.md`）：

- [ ] `config.js` → 参数集中的好处
- [ ] `core/app.js` → 渲染循环、相机、光照、天空穹顶（ShaderMaterial 第一次出现，看不懂没关系）
- [ ] `world/track.js` → **重点**：样条曲线、自定义 BufferGeometry、三角形顶点顺序
- [ ] `world/environment.js` → InstancedMesh 实例化渲染
- [ ] `game/car.js` → **重点**：速度分解、抓地力、指数衰减
- [ ] `game/camera.js` → 帧率无关的插值跟随
- [ ] `game/race.js` → 状态机、进度判定
- [ ] `game/game.js` → 全局调度

**动手任务（难度递进）**
- [ ] 把圈数改成 5 圈，赛道加宽到 22
- [ ] 车顶加一个会转的警灯（场景图练习）
- [ ] 新增一种道具"香蕉皮"，压到后 1 秒内抓地力减半（改 `car.js` 的参数）
- [ ] 做一个"倒计时 60 秒内吃尽可能多金币"的新模式（改 `race.js`）
- [ ] 把 HUD 换成你喜欢的风格（改 CSS + `ui/hud.js`）

**验收**：能画出本项目的模块依赖图，并说清"一帧里依次发生了什么"。

---

## 阶段 3 · 进阶功能（3～4 周）

每学一项都往赛车项目里加：

| 主题 | 学什么 | 加进项目的练习 |
| --- | --- | --- |
| **模型加载** | `GLTFLoader` 加载 `.glb`，`DRACOLoader` 压缩 | 去 [Sketchfab](https://sketchfab.com/) 下个免费低模车替换现在的方块车 |
| **交互** | `Raycaster` 射线拾取 | 点击赛道上的锥桶把它删掉 |
| **动画** | `AnimationMixer`、骨骼动画 | 起点处放一个挥手的小人 |
| **曲线动画** | `CatmullRomCurve3` + `getPointAt` | 让几架飞机沿曲线在赛道上方飞过 |
| **后处理** | `EffectComposer`、描边/泛光/景深 | 加一层描边或轻微 bloom |
| **环境光** | `PMREMGenerator` + HDRI 环境贴图 | 试试黄昏光照下的赛道（要换成 PBR 材质） |
| **响应式/性能** | 自适应分辨率、`renderer.info`、合并几何体 | 把帧率从 60 优化到稳定 60（低端设备） |

📚 资源
- 官方示例站是同主题最好的教材，找对应关键词
- glTF 规范 <https://www.khronos.org/gltf/>；模型优化工具 <https://gltf-transform.dev/>
- 免费模型：Sketchfab、[Poly Pizza](https://poly.pizza/)、Kenney.nl

---

## 阶段 4 · 着色器 GLSL（2～4 周）

**目标：能写自定义 ShaderMaterial，理解"GPU 上每个像素发生了什么"。**

- [ ] 渲染管线：顶点着色器 → 光栅化 → 片元着色器
- [ ] GLSL 语法：`attribute / uniform / varying`、`vec2/vec3/vec4`、`mix/smoothstep/step`
- [ ] 用 shader 做：渐变天空、水面波纹、溶解消失、扫描线
- [ ] 了解 `ShaderMaterial` 与 `RawShaderMaterial` 的区别

**练习**：本项目 `core/app.js` 里的天空穹顶就是一个 20 行的自定义 shader，
把它改成"日出/星空/彩虹"三种。

📚 资源
- The Book of Shaders（中文）<https://thebookofshaders.com/?lan=ch> ← 最好的入门
- Shadertoy <https://www.shadertoy.com/> ← 抄着玩，理解 fragment shader
- WebGL Fundamentals（中文）<https://webglfundamentals.org/webgl/lessons/zh_cn/> ← 想懂底层必看

---

## 阶段 5 · 数学与性能（持续，边做边补）

**数学**（够用即可，不要死磕）
- [ ] 向量：加减、点积（投影/夹角）、叉积（求法线）
- [ ] 矩阵：平移/旋转/缩放的 4×4 矩阵，为什么需要它
- [ ] 四元数：为什么旋转不用欧拉角（万向节死锁），会用 `Quaternion.setFromUnitVectors` 就行
- [ ] 插值：`lerp`、缓动 `easing`、贝塞尔曲线
- [ ] 三角/弧度换算、`atan2`

📚 《3D Math Primer for Graphics and Game Development》<https://gamemath.com/>（免费在线）
📚 Immersive Math（交互式线代）<http://immersivemath.com/ila/>

**性能**
- [ ] 用 `renderer.info` 看 draw call 和三角形数
- [ ] 减少 draw call：InstancedMesh、合并几何体（`BufferGeometryUtils.mergeGeometries`）
- [ ] 减少状态切换：复用材质、合并贴图（atlas）
- [ ] 阴影/后处理是最大的性能杀手，学会按需开关
- [ ] 移动端要控制像素比（`setPixelRatio(Math.min(devicePixelRatio, 2))`）
- [ ] 用 Spector.js <https://spector.babylonjs.com/> 抓帧分析

---

## 阶段 6 · 工程化与生态（2～3 周）

- [ ] **TypeScript**：给项目加类型，`@types/three` 能极大减少查文档次数
- [ ] 构建工具：Vite 配置、环境变量、代码分割（three.js 本体就有 500KB+）
- [ ] 调试面板：`lil-gui` 或 `Leva` 做实时参数调节
- [ ] **物理引擎**：`Rapier` <https://rapier.rs/> 或 `cannon-es`，把赛车换成真实物理
- [ ] **React 生态**（如果做业务）：`@react-three/fiber` <https://docs.pmnd.rs/react-three-fiber>
      + `@react-three/drei`（大量现成组件），思路和本项目的类式写法不同但概念一致
- [ ] **建模**：Blender 入门 <https://www.blender.org/>，能自己改模型、导出 glb
      （Blender Guru 的"甜甜圈教程"是经典入门）

---

## 阶段 7 · 选方向（学到这儿你自己会有答案）

Web 3D 的常见出路，选一个深耕：

| 方向 | 典型技术 | 代表作 |
| --- | --- | --- |
| **游戏 / 互动体验** | three.js + 物理 + 音频 + 后处理 | 各种品牌营销小游戏、Web 版小游戏 |
| **产品展示 / 电商** | 模型轻量化、AR（`WebXR`）、配置器 | 汽车/家具在线配置器 |
| **数据可视化 / 数字孪生** | 大规模实例化、GIS、BIM 集成 | 智慧城市、工厂监控 |
| **创意网页 / 作品集** | GSAP + shader + 滚动驱动 | Awwwards 获奖站点 |
| **XR / VR** | WebXR Device API | Quest 浏览器里的 VR 场景 |

---

## 学习节奏建议

**每天怎么练（1 小时版）**

| 时间 | 做什么 |
| --- | --- |
| 15 min | 看文档/教程（只学马上要用的） |
| 40 min | 动手写，遇到问题就查 → 试 → 再查 |
| 5 min | 记一条笔记：今天踩的坑 + 解决方式 |

**三条铁律**

1. **不要囤教程。** 一个知识点看完立刻写代码，写不出来就说明没懂。
2. **不要一开始就做"大项目"。** 先做 10 个 50 行的小 demo，比憋一个 5000 行的半成品强得多。
3. **报错先看 Console 第一行。** 90% 的问题（路径错、API 改名、参数类型不对）那里就写着答案。

**常见误区**

| 误区 | 后果 | 正确做法 |
| --- | --- | --- |
| 先学完线性代数再动手 | 坚持不下去 | 用到什么学什么 |
| 只复制代码不改 | 一换需求就卡住 | 每段代码都试着改 3 个参数看变化 |
| 追新版本/新库 | 时间都花在配置上 | 锁定一个版本（比如本项目 `three@0.161.0`）学透 |
| 一上来就上 React Three Fiber | 不懂底层，出问题无从下手 | 先用原生 three.js 写 2～3 个项目 |
| 死磕性能优化 | 项目做不完 | 先跑通，卡了再优化 |

**里程碑自测**

- [ ] 3 个月后：能独立做一个"3D 产品展示页"（模型 + 光照 + 旋转 + 交互）
- [ ] 6 个月后：能独立做一个带物理/动画/UI 的小游戏（比如把这个赛车改成你的版本）

---

## 附：本项目技能地图

想知道每块代码对应哪个知识点，看这里：

| 项目功能 | 涉及的知识点 | 文件 |
| --- | --- | --- |
| 全场渲染 | Scene / Camera / Renderer / 渲染循环 / 雾 | `core/app.js` |
| 卡通质感 | MeshToonMaterial / 色阶贴图 / 背面描边 | `core/materials.js` `core/textures.js` |
| 天空与太阳 | ShaderMaterial / 渐变 / BackSide / 自发光球体 | `core/app.js` |
| 赛道 | CatmullRomCurve3 / BufferGeometry / UV / 顶点顺序 | `world/track.js` |
| 树与云 | InstancedMesh / instanceColor / 低模 | `world/environment.js` |
| 金币锥桶 | 共享几何体 / 碰撞检测（距离判定）/ 抛体运动 | `world/props.js` |
| 车 | 场景图 / Group 嵌套 / 向量分解 / 指数衰减 | `game/car.js` |
| 相机 | lerp 插值 / lookAt / FOV / 屏幕抖动 | `game/camera.js` |
| 比赛规则 | 状态机 / 进度判定 / 计时 | `game/race.js` |
| 输入 | 事件监听 / 统一抽象 | `game/input.js` |
| 音效 | Web Audio API 振荡器合成 | `game/audio.js` |
| 粒子 | 对象池 / 透明度动画 | `fx/particles.js` |
| HUD / 小地图 | DOM 操作 / Canvas 2D / Path2D / 坐标映射 | `ui/` |

开练吧 🏁
