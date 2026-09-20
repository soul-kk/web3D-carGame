# 🏎️ 卡通赛车 · Three.js 入门项目

一个用 **Three.js** 写的浏览器 3D 赛车小游戏：卡通渲染、闭合赛道、漂移手感、圈速计时。
代码按现代前端工程组织成小模块，**每一层都有注释讲解"为什么这么写"**，适合当作 Web 3D 的第一份可运行教材。

> 没有 3D 基础也能读：文档里遇到的概念（坐标系、渲染循环、样条曲线、实例化渲染…）
> 都在 [`docs/threejs-basics.md`](docs/threejs-basics.md) 里有配着本项目代码的通俗解释。

---

## 1. 快速开始

```bash
npm install     # 安装依赖（只要 three 和 vite）
npm run dev     # 启动开发服务器，浏览器打开终端里显示的 http://localhost:5173
```

其它命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式，改代码浏览器自动刷新（HMR） |
| `npm run build` | 打包到 `dist/`，可直接丢到任何静态服务器 |
| `npm run preview` | 本地预览打包结果 |

**操作方式**

| 按键 | 作用 |
| --- | --- |
| `W` `↑` | 加速 |
| `S` `↓` | 刹车 / 倒车 |
| `A` `←` `D` `→` | 转向 |
| `R` | 翻车/卡住时回到赛道 |
| `M` | 开关音效 |
| `空格` / `回车` | 开始比赛、再来一局 |

手机或触屏设备会自动出现虚拟方向键。

---

## 2. 目录结构

```
.
├── index.html              # 页面骨架 + HUD 的 DOM 结构（不含一行脚本逻辑）
├── package.json
├── vite.config.js
├── legacy/
│   └── racing.singlefile.html   # 重构前的单文件版本（存档，不再维护）
├── docs/
│   ├── threejs-basics.md   # 3D / Three.js 基础概念速查
│   └── learning-path.md    # Web 3D 学习路线图
└── src/
    ├── main.js             # 入口：只负责"组装"，不写逻辑
    ├── config.js           # 所有可调参数（速度、圈数、颜色、赛道控制点…）
    │
    ├── core/               # 引擎层：与玩法无关的通用能力
    │   ├── app.js          # 渲染器 / 场景 / 相机 / 光照 / 天空 + 主循环
    │   ├── materials.js    # 卡通材质工厂、描边材质
    │   └── textures.js     # 程序化贴图（色阶、棋盘格、箭头）
    │
    ├── world/              # 世界层：赛道与静物
    │   ├── track.js        # 赛道曲线、路面/路肩/虚线/起跑线、最近点查询
    │   ├── environment.js  # 草地、树木、远山、云
    │   └── props.js        # 金币 / 锥桶 / 加速带
    │
    ├── game/               # 玩法层
    │   ├── game.js         # ★ 主控：串联所有模块，实现"每帧发生什么"
    │   ├── car.js          # 赛车模型 + 街机物理
    │   ├── race.js         # 状态机、计时、圈数判定
    │   ├── camera.js       # 第三人称追尾相机
    │   ├── input.js        # 键盘 + 触屏 → 统一的驾驶输入
    │   └── audio.js        # Web Audio 合成音效（无音频文件）
    │
    ├── ui/                 # 界面层（纯 DOM / Canvas 2D）
    │   ├── hud.js          # 时速、圈速、金币等文字
    │   ├── minimap.js      # 右上角小地图
    │   └── overlay.js      # 开始 / 结算界面
    │
    ├── fx/
    │   └── particles.js    # 粒子池：轮胎扬尘、漂移白烟、碰撞火花
    └── styles/
        └── main.css
```

### 为什么这样分？

依赖是**单向**的，读代码时可以一层一层往下看：

```
main.js
  └── game/game.js          ← 只认识下面这些"零件"，零件之间互不认识
        ├── game/car.js
        ├── game/race.js
        ├── game/camera.js
        ├── world/track.js
        ├── world/props.js
        └── ui/*
```

好处：

- **改外观**几乎只动 `world/`；**改手感**只动 `config.js` + `game/car.js`；**改规则**只动 `game/race.js`。
- 每个文件 100～300 行，可以单独阅读、单独测试、单独替换。
- `game/game.js` 是唯一知道"全局"的地方，出了问题先看它。

---

## 3. 一帧里发生了什么

`src/game/game.js` 的 `update(dt)` 就是整个游戏的心跳，顺序如下：

```
① 读输入            input.read()              → { throttle, brake, steer }
② 定位               track.nearest(x, z)      → 离赛道中心线多远、跑到哪一段了
③ 车辆物理           car.update(dt, ...)      → 加速 / 转向 / 抓地 / 漂移
④ 交互              撞锥桶 / 吃金币 / 压加速带
⑤ 规则               race.update(dt)          → 计时、判定过线、完赛
⑥ 世界动画          金币自转、云飘、粒子扩散
⑦ 相机与光照         追尾相机 + 太阳跟着车走
⑧ UI 与声音          HUD 文字、小地图、引擎声
⑨ 渲染               renderer.render(scene, camera)
```

`dt` 是"距上一帧过了多少秒"。**所有运动都乘以 dt**，游戏速度才不会因为电脑快慢而不同
（`app.js` 里还把它限制在 0.033 秒以内，防止切标签页回来后画面"瞬移"）。

---

## 4. 几个关键实现

### 4.1 卡通渲染：怎么让 3D 看起来像动画

普通材质的光照是连续渐变的，卡通渲染要把明暗"切成几档"。做法是给
`MeshToonMaterial` 喂一张只有 4 个像素的一维贴图（`core/textures.js`）：

```js
// 4 档亮度：暗 → 亮
data[i] = Math.round(255 * Math.pow((i + 1) / steps, 0.85));
```

于是物体表面只会出现 4 种明暗，边缘变得干脆，这就是动画质感。
再加上"描边"（`core/materials.js` 的 `addOutline`）——把模型复制一份、反面渲染、放大 6% 涂成黑色，
就有了漫画式的轮廓线。

### 4.2 赛道：一条曲线生成整个世界

`world/track.js` 里只用 13 个控制点定义赛道，然后用 `CatmullRomCurve3` 生成平滑的闭合曲线，
再沿曲线两侧各偏移半个路宽，连成一条"带子"就是路面。

这条曲线同时还是**游戏规则的依据**：

```js
const nearest = track.nearest(car.position.x, car.position.z);
const onTrack = nearest.distance < track.halfWidth + 0.8;   // 是否压到草地
const progress = nearest.index / track.count;                // 0→1 的跑圈进度
```

进度从 `0.99` 跳回 `0.01`，就说明刚越过起跑线、完成一圈（见 `game/race.js`）。

### 4.3 性能：实例化渲染

场上有 260 棵树 × 3 个部件。如果每棵都建 `Mesh`，CPU 每帧要做 780 次提交。
`InstancedMesh` 把"一份几何体 + 一堆变换矩阵"一次性交给 GPU，
只需要 **3 次**绘制调用（`world/environment.js`）。

### 4.4 手感：几十行写出能漂移的车

`game/car.js` 不追求真实物理，而是把速度拆成两个方向：

```js
vf = velocity · forward    // 车头方向的速度 → 油门、刹车、阻力作用在这里
vr = velocity · right      // 侧滑速度       → 按指数衰减，衰减越慢越容易漂移
```

把这个衰减系数调小（`config.js` 里的 `gripOnTrack`），车尾就会甩出去 —— 这就是漂移。

### 4.5 相机：不要硬跟

相机位置每帧向"车后上方"做**指数插值**：

```js
camera.position.lerp(desired, 1 - Math.exp(-k * dt));
```

用 `1 - exp(-k·dt)` 而不是固定比例，能让不同帧率下的跟随手感保持一致。
再让速度和视野（FOV）挂钩，就得到了速度感（`game/camera.js`）。

---

## 5. 动手改一改（推荐按顺序做）

改完直接看效果，这是学得最快的方式。全部改动点都在 `src/config.js`：

| 想做的事 | 改哪里 |
| --- | --- |
| 车开得更快 / 更飘 | `CAR.maxSpeed`、`CAR.gripOnTrack`（调小＝更容易漂移） |
| 改成 5 圈 | `RACE.laps` |
| 把赛道换个形状 | `TRACK.controlPoints`（13 个 `[x, z]` 点，随便拖） |
| 路更宽 / 更窄 | `TRACK.width` |
| 换成夜景/黄昏 | `WORLD.sky`、`WORLD.fog`、`WORLD.sunDirection` |
| 换车身颜色 | `COLORS.carBody` |
| 路肩条纹更密 | `track.js` 里 `Math.floor(i / 7)` 的 `7` |
| 加一个道具 | 仿照 `world/props.js` 里的 `Coins` 写一个新类，在 `game.js` 里调用 |

**小练习**

1. 在 `world/props.js` 里加一种"油桶"，压到就打滑 1 秒。
2. 给 HUD 加一个"漂移中 +50 分"的连击计分。
3. 把 `Car` 的模型改成一辆卡车（改 `#buildModel` 里的 `BoxGeometry` 尺寸）。
4. 把 `Race` 改成"3 圈内跑进 90 秒"的限时挑战模式。

---

## 6. 调试与常见问题

**浏览器控制台里有个 `__game`**，可以直接改运行时状态：

```js
__game.car.applyBoost(10)        // 立即获得 10 秒加速
__game.car.velocity.set(0, 40)   // 直接给速度（Vector2 的 y 是世界的 Z）
__game.race.coins                // 当前金币数
__game.race.mode = 'finished'    // 强制跳到结算
```

想稳定观察性能，可以在 `main.js` 里打印 `app.renderer.info.render`（绘制调用次数）。

| 现象 | 原因 / 解决 |
| --- | --- |
| 页面全白、控制台报 `Failed to resolve module specifier "three"` | 忘了 `npm install`，或没通过 dev server 打开（直接双击 `index.html` 是不行的，ES 模块需要 http 协议） |
| 画面很卡 | 降低 `renderer.setPixelRatio` 上限（`core/app.js`）、减少树木数量、关掉阴影 `renderer.shadowMap.enabled = false` |
| 阴影边缘有锯齿/闪烁 | 调 `renderer.shadowMap.type`、`shadow.bias`，或缩小 `WORLD.shadowRadius` |
| 草地和路面闪烁（Z-fighting） | 两者贴太近，拉开 `TRACK.surfaceY` 和路肩的 y 偏移 |
| 改了代码没反应 | 看终端里 Vite 有没有报错；语法错误会让 HMR 停住 |

---

## 7. 想继续深入

- 基础概念速查 → [`docs/threejs-basics.md`](docs/threejs-basics.md)
- 系统学习路线 → [`docs/learning-path.md`](docs/learning-path.md)
- Three.js 官方文档 <https://threejs.org/docs/> · 官方示例 <https://threejs.org/examples/>
- 官方中文手册 <https://threejs.org/manual/#zh/fundamentals>

祝玩得开心 🏁
