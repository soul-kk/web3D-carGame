# 全局安装 playwright-cli skill（给 pi 自己用）

## Context

需求：把 microsoft/playwright-cli 的 skill 全局安装到本机，让 pi 在所有项目里都能自动按需加载这个 skill。

已确认的事实（来自仓库与 npm 包源码）：

- 仓库 `microsoft/playwright-cli` 里就是一份 skill：`skills/playwright-cli/SKILL.md` + `references/*.md`（10 个参考文档）。
- 官网安装方式：`npm install -g @playwright/cli@latest`，然后 `playwright-cli install --skills`。
- 安装实现（playwright-core `lib/tools/utils/installSkills.ts`）：
  - 加 `--global`（`-g`）时目标目录是 `~/.{target}/skills/{skill}`，不加则装到当前项目目录。
  - `--skills=agents` → `~/.agents/skills/playwright-cli/`；`--skills=claude` → `~/.claude/skills/playwright-cli/`。
  - `--global` 必须搭配 `--skills`，否则报错 `Error: --global requires --skills`。
  - 全局安装时会**跳过浏览器下载**（`if (!globalSkills) ensureConfiguredBrowserInstalled()`）。
- pi 的全局 skill 目录就是 `~/.agents/skills/` 和 `~/.pi/agent/skills/`；本机现有全局 skill（docx/pdf/pptx/xlsx/frontend-design 等）都放在 `~/.agents/skills/`。
- 该 npm 包捆绑的 SKILL.md 与仓库里的完全一致（已 diff 验证），所以用官方安装器即可，不需要从 git 仓库手工拷。

## Approach

直接用官方安装器（推荐）：

1. 全局安装 CLI 本体：`npm install -g @playwright/cli@latest`
2. 把 skill 装到 pi 的全局 skill 目录：`playwright-cli install --skills=agents --global`
   - 结果：`~/.agents/skills/playwright-cli/{SKILL.md,references/*.md}` → pi 启动时自动发现，所有项目可用。
3. 装浏览器运行时（可选但建议）：`playwright-cli install-browser`（首次 `playwright-cli open` 也会触发）。

不选备选方案的原因：
- `npx skills add microsoft/playwright-cli -g -y`：只装 skill 文件，不装 `playwright-cli` 命令，skill 里所有命令都得退回 `npx playwright cli`。
- 手工 clone 仓库后 copy 到 `~/.agents/skills/`：版本会漂移，且没有 CLI。

## Files to modify

- 新增（由安装器创建，不在本仓库内）：
  - `~/.agents/skills/playwright-cli/SKILL.md`
  - `~/.agents/skills/playwright-cli/references/*.md`（10 个）
- 本仓库不改动（不需要提交任何文件；`.pi/` 里也无需配置，因为 `~/.agents/skills` 是 pi 默认全局目录）。

## Reuse

- 官方安装逻辑：`playwright-core/lib/tools/utils/installSkills.ts` 的 `installSkills(skills, target, {global})`。
- 官方入口命令：`playwright-cli install`（隐藏命令，`--skills=<claude|agents>`、`-g/--global`）。
- pi 的 skill 发现规则（`docs/skills.md`）：`~/.agents/skills/<name>/SKILL.md` 会被递归发现，无需在 `settings.json` 里额外声明 `skills` 数组。

## Steps

- [x] 1. `npm install -g @playwright/cli@latest`（当前未安装，`which playwright-cli` 为空）。
- [x] 2. `playwright-cli install --skills=agents --global`。
- [x] 3. 校验文件落地：`ls ~/.agents/skills/playwright-cli/`，确认 SKILL.md + references/ 存在，且 SKILL.md 的 frontmatter `name: playwright-cli`。
- [x] 4. `playwright-cli install-browser`（安装 chromium；本机已有 Chrome 时会选用 Chrome）。
- [x] 5. 冒烟测试：`playwright-cli open https://example.com && playwright-cli --raw eval "document.title" && playwright-cli close`。
- [x] 6. 重启 pi，确认 skill 出现在可用 skill 列表（`/skill:playwright-cli` 可用）。

## Verification

- `playwright-cli --version` 有输出，且能看到更新提示机制正常工作。
- `~/.agents/skills/playwright-cli/SKILL.md` 存在，内容与 `node -e "console.log(require.resolve('playwright-core'))"` 同级的 `lib/tools/skills/playwright-cli/SKILL.md` 一致。
- pi 新会话里系统提示的 available skills 中包含 `playwright-cli`；`/skill:playwright-cli` 能加载。
- 冒烟：`playwright-cli open https://example.com` → `snapshot` 返回页面树 → `close` 正常。

## 已知注意点

- 升级 CLI 后需要重跑 `playwright-cli install --skills=agents --global` 才能同步 skill；包内的版本校验（`skillCheck.js`）只检查当前目录下的 `.claude/.agents/skills`，不会提示全局那份过期。
- 另有 `playwright-component-testing`、`playwright-trace` 两个 skill 也随 playwright-core 一起分发，但官方 `install` 只装 `playwright-cli`。如需一并安装可后续手工 copy（本次默认不装）。
