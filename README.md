# 🏎️ 卡通赛车 · Three.js 入门项目

一个用 **Three.js** 写的浏览器 3D 赛车小游戏：卡通渲染、闭合赛道、手刹漂移双档氮气与得分、幽灵车对决、圈速计时、两套车辆皮肤。
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
| `Shift` | 手刹漂移（充到 50% 松手短喷；100% 松手长喷） |
| `R` | 翻车/卡住时回到赛道 |
| `M` | 开关音效 |
| `空格` / `回车` | 在主界面开始比赛、完赛后再来一局 |
| `ESC` | 比赛（含倒计时）暂停 / 继续；在退出确认页返回暂停页 |

主界面直接展示当前赛道；点击「开始游戏」后镜头平滑接入赛车视角，随后才开始倒计时。「玩法说明」可查看操作提示；主界面可切换红色赛车或飞碟（会记住选择），也可以在「更换地图」里挑选赛道（会记住选择，最佳成绩与幽灵车按地图分别记录）。
比赛中暂停可选择继续或返回主界面；返回前会二次确认，确认后本局进度不保留。完赛结算可选择再来一局或返回主界面。
手机或触屏设备在比赛中有虚拟方向键、「漂移」键和顶部「暂停」按钮。
HUD 展示本场漂移累计分与历史最高单场漂移总分；有效顺行侧滑时，屏幕下方会显示正在上涨的漂移得分。**记录（最佳单圈 / 最佳总用时 / 最佳单场漂移总分 / 幽灵车）按地图独立，且仅在完赛时写入浏览器 localStorage**；中途退出不会保存当局新纪录。主界面底部可「清除最佳记录」。

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
    │   ├── textures.js     # 程序化贴图（色阶、棋盘格、箭头）
    │   └── storage.js      # localStorage 安全读写（隐私模式也不报错）
    │
    ├── world/              # 世界层：赛道与静物
    │   ├── maps.js         # 所有地图：形状 + 主题 + 配乐 + 道具摆法
    │   ├── track.js        # 赛道曲线、路面/路肩/虚线/起跑线、最近点查询
    │   ├── environment.js  # 草地、树木、远山、云
    │   └── props.js        # 金币 / 加速带
    │
    ├── game/               # 玩法层
    │   ├── game.js         # ★ 主控：串联所有模块，实现"每帧发生什么"
    │   ├── car.js          # 赛车模型 + 街机物理 + 手刹漂移/氮气
    │   ├── race.js         # 状态机、计时、圈数判定
    │   ├── ghost.js        # 幽灵车：录制整场最佳、回放、存档
    │   ├── skins.js        # 车辆皮肤：外观方案 + 选中项持久化
    │   ├── camera.js       # 第三人称追尾相机
    │   ├── input.js        # 键盘 + 触屏 → 统一的驾驶输入
    │   ├── audio.js        # Web Audio 合成音效（无音频文件）
    │   └── music.js        # 背景音乐（Web Audio 合成，无音频文件）
    │
    ├── ui/                 # 界面层（纯 DOM / Canvas 2D）
    │   ├── hud.js          # 时速、圈速、金币等文字
    │   ├── minimap.js      # 右上角小地图
    │   └── overlay.js      # 主菜单 / 玩法说明 / 暂停 / 结算界面
    │
    ├── fx/
    │   ├── particles.js    # 粒子池：轮胎扬尘、漂移白烟、氮气尾焰
    │   └── skidmarks.js    # 实例化双后轮胎痕：固定对象池、逐渐淡出
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
        ├── game/ghost.js
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

```text
① 状态门控          menu / transition / playing / paused / finished
② 读输入            input.read()              → { throttle, brake, steer, handbrake }
③ 定位               track.nearest(x, z)      → 离赛道中心线多远、跑到哪一段了
④ 车辆物理           car.update(dt, ...)      → 加速 / 转向 / 抓地 / 漂移充能
⑤ 交互              吃金币 / 压加速带 / 喷氮气
⑥ 幽灵车             recorder.record() / ghost.update()
⑦ 规则               race.update(dt)          → 计时、判定过线、完赛
⑧ 世界动画          金币自转、云飘、粒子扩散
⑨ 相机与光照         追尾相机 + 太阳跟着车走
⑩ UI 与声音          HUD 文字、小地图、引擎声
⑪ 渲染               renderer.render(scene, camera)
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

两条赛道用 `tools/segments/*.mjs` 描述直道与弯道，再经 `tools/make-track.mjs` 生成 `src/config.js` / `src/world/maps.js` 中的控制点；`world/track.js` 用 `CatmullRomCurve3` 生成平滑闭合曲线，
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

### 4.5 漂移攒氮气：奖励放在"松开"的那一刻

按住 `Shift` 时把抓地力压到一个上限（`CAR.handbrakeGrip`），车尾就甩出去了：

```js
let grip = onTrack ? CAR.gripOnTrack : CAR.gripOffTrack;
if (handbrake) grip = Math.min(grip, CAR.handbrakeGrip);   // 7 → 4.2
vr *= Math.exp(-grip * dt);
```

侧滑速度够大（`NITRO.driftMinLateral`）就持续充能；到 **50%～99% 松手**短喷（0.8 秒、温和提速），**100% 松手**保持原有长喷（1.6 秒、原有加速倍率）。未到半格不喷。
这个设计的关键在于"奖励时机"：如果持续按住就给加速，玩家会一路按着手刹不放；
把奖励放在松开的那一刻，漂移就变成一次有始有终的操作。

**反馈链**：按手刹未充能时 HUD 提示原因（速度不足、离开路面或未甩尾）；
有效漂移跨过 50% / 100% 充能分别响起短音并显示「松开短喷 / 松开满喷」。
侧滑时轮胎摩擦声随侧滑量渐强、赛道留下双后轮胎痕、镜头轻微侧倾；松手释放后有前冲与闪光；
短喷以暖色边缘光、满喷以蓝色边缘光区分，尾焰与速度线持续到氮气结束（加速带不触发屏幕氮气特效），可用时还有触屏振动。按 `M` 静音；系统启用
「减少动态效果」时，侧倾、前冲、屏幕闪光及振动自动停用，保留必要的文字提示。
比赛中按路面内、正向行进的有效漂移时间、速度和侧滑量累计分数；漂移时下方实时跳分，松手停止，本场分数跨圈累计；完赛后最高单场总分按地图保存。胎痕用固定数量的 `InstancedMesh` 复用，不会越跑越占内存。

调这个手感时有两个真实的坑（都是靠自动跑圈测出来的，注释里写明了）：

- `handbrakeDrag` 是**指数**系数，`0.7` 意味着漂一秒速度乘 `exp(-0.7) ≈ 0.5`；当前设为 `0.02` 并在有效侧滑时补一点油门，让出弯氮气回本。
- 手刹再叠一个转向倍率会让车直接打转（侧滑角冲到 60° 以上），所以 `handbrakeTurnGain` 保持 `1.0`。

### 4.6 幽灵车：把"历史最佳"录下来重放

计数器赛最大的问题是跑完就没理由再跑，所以让玩家和**上一局的自己**比赛：

1. 绿灯亮起后每帧把位置和朝向按 30Hz 存进 `GhostRecorder`（固定时间步，和帧率无关）
2. 刷新最佳**总用时**的那一局，把整场的采样存进 `localStorage`
3. 下一局读出采样，用一辆半透明赛车按时间轴插值播放（`GhostPlayer`）

位置乘 100 再取整存储（定点化），一场 30Hz 的比赛大约 1300 帧，只要 20KB 左右。
朝向插值要走**最短弧**（把差值规整到 `(-π, π]`），否则跨过 ±180° 时幽灵车会突然原地转一圈。

**为什么录「整场」而不是「最佳单圈」：** 一开始的实现是存最佳单圈，结果玩家会发现
幽灵车**一开场就比自己快**。原因是录单圈录到的可能是**飞行圈**（例如第 2 圈，
过起点线时已经满速 55 m/s），而玩家第 1 圈是静止起步 —— 两边时间轴都从 0 开始，
幽灵车 0.25 秒就领先 13 个单位、2 秒领先 72 个（实测），这种对比没有意义。

录整场就没这个问题：幽灵车的第 0 帧同样是「停在起点线、速度 0」，
它和玩家跑的是同一个赛程（静止起步 + 2 圈），从绿灯到终点线全程可比，
中途也不需要重置。代价是得跑完一整局才会产生幽灵车；
单圈记录仍单独存储、在 HUD 上作为「最佳」。两张赛道重绘后旧版本用时与幽灵已不可比（存档版本升到 v4），须重新跑出记录。

### 4.7 缓存与存储：不要让 localStorage 拆了游戏

隐私模式、禁用 Cookie、`file://` 直开、配额写满 —— 这些情况下访问 `localStorage`
是**抛异常**而不是返回 null。所以 `core/storage.js` 把读写全部包进 `try`，
失败就退化成"这局没有历史记录"，游戏照常能玩。

### 4.8 相机：不要硬跟

相机位置每帧向"车后上方"做**指数插值**：

```js
camera.position.lerp(desired, 1 - Math.exp(-k * dt));
```

用 `1 - exp(-k·dt)` 而不是固定比例，能让不同帧率下的跟随手感保持一致。
再让速度和视野（FOV）挂钩，就得到了速度感（`game/camera.js`）。

### 4.9 车辆皮肤：两套座驾，随手换

主界面「选座驾」和完赛结算页都有皮肤按钮（🏎️ 红色赛车 / 🛸 飞碟），点一下就换车，
选中的皮肤存进 `localStorage`，下次打开还在。

**为什么单独放一个 `skins.js`**：车辆模型在 `car.js` 里，选择器在 `ui/overlay.js` 里。
如果把"有哪些皮肤"写在任意一边，另一边就得反过来 import 它，依赖就变成**双向**的了。
放进独立的 `skins.js`，两边都只依赖它，依赖方向依然是单向的：

```text
car.js ──┐
         ├── skins.js        # 只有"有哪些皮肤"这一份数据
overlay.js ─┘
```

每套皮肤只描述**颜色**，具体怎么搭出来由 `car.js` 负责：

```js
{ id: 'saucer', name: '飞碟', body: 0x8855ff, dark: 0x4433aa, glass: 0x00ffcc, ... }
```

两套造型的**结构完全不同**（赛车有轮子和尾翼，飞碟是悬浮舱），所以 `createCarModel`
按 `skinId` 分叉到两个建模函数。幽灵车用同一套外观——幽灵是"上一局的自己"，
长得不一样会很奇怪。

---

## 5. 动手改一改（推荐按顺序做）

改完直接看效果，这是学得最快的方式。全部改动点都在 `src/config.js`：

| 想做的事 | 改哪里 |
| --- | --- |
| 车开得更快 / 更飘 | `CAR.maxSpeed`、`CAR.gripOnTrack`（调小＝更容易漂移） |
| 改成 5 圈 | `RACE.laps` |
| 把赛道换个形状 | 改 `tools/segments/grassland.mjs` / `volcano.mjs`，用 `tools/make-track.mjs` 重生成控制点并用 `tools/map-check.mjs` 核对道具/断桥 |
| 路更宽 / 更窄 | `TRACK.width`（火山地图另有 `world/maps.js` 中的 `width`） |
| 换成夜景/黄昏 | `WORLD.sky`、`WORLD.fog`、`WORLD.sunDirection` |
| 换车身颜色 | `COLORS.carBody` |
| 加一套新皮肤 | `game/skins.js` 的 `SKINS` 数组加一项，再在 `car.js` 里加对应的建模分支 |
| 路肩条纹更密 | `track.js` 里 `Math.floor(i / 7)` 的 `7` |
| 漂移更容易攒满氮气 | `NITRO.chargeRate`（调大）、`NITRO.driftMinLateral`（调小） |
| 手刹漂移得更狠 / 更稳 | `CAR.handbrakeGrip`（调小＝甩得更开） |
| 氮气喷得更久 | 满喷 `NITRO.boostDuration`、短喷 `NITRO.shortBoostDuration` / `shortBoostFactor` |
| 幽灵车或漂移纪录不想要了 | 开始界面点「清除最佳记录」（只清当前地图），或清理对应 `toon-racing:best:<地图 id>` |
| 加一个道具 | 仿照 `world/props.js` 里的 `Coins` 写一个新类，在 `game.js` 里调用 |

**小练习**

1. 在 `world/props.js` 里加一种"油桶"，压到就打滑 1 秒。
2. 给漂移分数加一个「连续转弯倍率」，并限制重复绕圈刷分。
3. 把 `Car` 的模型改成一辆卡车（改 `createCarModel` 里的 `BoxGeometry` 尺寸，玩家车和幽灵车会一起变）。
4. 把 `Race` 改成"2 圈内跑进 90 秒"的限时挑战模式。
5. 给幽灵车加一个"领先/落后几秒"的实时差时显示（比较玩家与幽灵的赛道进度）。

---

## 6. 调试与常见问题

**浏览器控制台里有个 `__game`**，可以直接改运行时状态：

```js
__game.car.applyBoost(10)        // 立即获得 10 秒加速
__game.car.velocity.set(0, 40)   // 直接给速度（Vector2 的 y 是世界的 Z）
__game.race.coins                // 当前金币数
__game.race.mode = 'finished'    // 强制跳到结算
__game.bestRecord                // 读到的历史最佳（含幽灵车采样）
__game.ghost.position            // 幽灵车当前跑到哪了
__game.recorder.data.length / 3  // 这一局已经录了多少帧
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
- 地图设计研究（摆位、子弹时间、断崖、地图交互）→ [`docs/map-design.md`](docs/map-design.md)
- Three.js 官方文档 <https://threejs.org/docs/> · 官方示例 <https://threejs.org/examples/>
- 官方中文手册 <https://threejs.org/manual/#zh/fundamentals>

祝玩得开心 🏁
