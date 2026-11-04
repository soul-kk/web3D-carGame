# 漂移玩法强化计划

## Context
两张地图需要让漂移线路更有优势；当前氮气要求满格，漂移缺少即时分数反馈。本计划覆盖赛道、氮气双档释放与比赛内漂移分数展示。

## Approach
- 修改两张地图的 `tools/segments/*.mjs` 段式赛道，使用 `tools/make-track.mjs` 的 `autoClose` / 重采样生成控制点并重新测量 t 区间；火山的 230m 断桥直道及起跳/落地直线必须保留，调整弯道和出弯道具使漂移释放氮气有实质时间优势。
- 当前仅松开手刹且充能 >=1 时自动释放；在 `Car` 中区分半档/满档的氮气时长和倍率（半档拟 0.8s、温和的速度/加速增益；满档维持现有 1.6s、1.5× 速度和 2.2× 加速），`Car.applyBoost` 的加速带默认档不变；松手 >=0.5 即喷并清空，<0.5 不喷。复用 `Game.#handleNitro` 特效链，明确两档提示。
- 复用 `Car.drifting`（手刹 + 在路上 + 速度/侧滑门槛），仅比赛中顺行有效漂移逐帧按游戏时间/车速加**本场总分**；HUD 常驻本场累计、漂移时重点显示不断上涨的大数字，并显示跨比赛最高单场总分。暂停/重生不加分，重赛清零，完赛时更新历史最佳。按项目既有逻辑**按地图分别保存**、清除当前地图记录时一起清零。

## Files to modify
- `tools/segments/grassland.mjs`、`tools/segments/volcano.mjs`、新增 `tools/drift-benchmark.mjs`（驾驶对照验证）、`src/config.js`、`src/world/maps.js`、`src/game/car.js`、`src/game/game.js`、`src/game/ghost.js`、`src/ui/hud.js`、`src/ui/overlay.js`、`src/styles/main.css`、`index.html`、`docs/map-design.md`、`README.md`。

## Reuse
- `src/config.js` 的 `CAR` / `NITRO` 配置和 `TRACK.controlPoints`；`src/world/maps.js` 的地图专属赛道与金币/加速带配置。
- `src/game/game.js` 的 `#handleNitro`、`#updateHud`、`resetWorld`、`#handleFinish` 和清记录入口；`src/game/race.js` 的 `isRacing`/`reset`/完赛回调；`src/game/ghost.js` 的 `loadBest`/`mergeBest`/`clearBest`（成绩按地图、仅完赛入库）；`src/ui/hud.js` 的节流 DOM 更新/状态文案；`src/core/storage.js` 的安全读写。`tools/map-check.mjs` 现可测两图曲率/桥跳跃；没有 test 命令。

## Steps
- [x] 为调整地图校准段式弯道半径与直道长度；生成两条赛道点列，刷新按弧长 t 摆放的金币/加速带及火山断桥参数；`map-check` 检查实际曲率/断口。
- [x] 增加短/满两档释放与 `NITRO` 配置；短档时长/倍率独立可调，满档原效果不变；出弯特效与 UI 清楚区分档位，加速带仍按原有参数生效。
- [x] 基于现有 `Race`/`Game` 生命周期累积比赛分数（有效侧滑、正向通过赛道、路面内且未腾空；重生/倒计时/暂停/出界不加）；将本场累计整数分和历史最佳合并到按地图的 `ghost.js` 成绩记录（仅完赛持久化），更新 HUD、结算页与主菜单展示，清记录入口一并处理。
- [x] 地图形状变化后提升成绩存档 `RECORD_VERSION`（当前为 3），避免旧幽灵/旧用时与新赛道混比；考虑旧纪录迁移无需沿用（新赛道不可比）。
- [x] 更新玩法说明与 README 中的半格释放/分数规则，修订地图研究文档里的过时长度、曲率及断桥数据。
- [ ] 编写并运行两图驾驶对照验证，调参直到两图代表弯与整圈的漂移跑法确实更快，同时保证不漂移仍能安全完成比赛；构建并手测 UI。

## Verification
- `npm run build` + `node tools/map-check.mjs`（两图真实曲率、道具都在路上、断口长度/起跳速度安全；确保桥始终处于笔直区间）。
- 增加可复现的驾驶对比测试脚本（同地图同车同一出发速度、全油门正常转弯/合理刹车 vs 进弯漂移出弯喷氮气，计时两图代表性弯+整圈；若漂移落后就调整弯半径/布局/手刹阻力及短喷参数直至漂移方案更快且仍可控）。验证半格与满格不同续航/强度、未到 50% 不喷、仅松手释放、加速带不触发氮气屏幕特效。
- 浏览器手测桌面/触屏：转向漂移数字逐帧上升、松手停止、本场累积不清零、跨圈不清零、完赛刷新历史分、重开清本场、换地图隔离、清记录、暂停/断桥重生/出界不刷分、窄屏与减少动画。
