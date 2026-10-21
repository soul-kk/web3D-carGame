# 项目协作要点

- 这是基于 Three.js 和 Vite 的浏览器 3D 赛车游戏；运行 `npm install`、`npm run dev`，提交前用 `npm run build` 检查。
- `src/main.js` 负责组装；`src/game/game.js` 调度每帧逻辑；可调参数在 `src/config.js`。玩法、世界、界面分别位于 `src/game/`、`src/world/`、`src/ui/`。`legacy/` 是不再维护的存档。
- 项目使用说明和架构解释在 `README.md`；当架构、工作流程或用户使用方式发生重大变化时，检查并按需更新 `agents.md` 与 `README.md`。

pdate documentation only for significant changes to architecture, workflows, or user-facing usage.
