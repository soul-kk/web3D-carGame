/**
 * 入口文件：只做"组装"，不写游戏逻辑。
 *
 * 依赖方向是单向的：
 *   main.js → Game → (Car / Race / Props / UI / 音效)
 * 任何模块都不反向依赖 main.js，所以你可以单独阅读、替换其中任意一层。
 */
import './styles/main.css';

import { createApp } from './core/app.js';
import { Track } from './world/track.js';
import { Game } from './game/game.js';
import { Input } from './game/input.js';
import { audio } from './game/audio.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Overlay } from './ui/overlay.js';

/* 1. 舞台：渲染器 / 场景 / 相机 / 光照 / 天空 */
const app = createApp(document.getElementById('app'));

/* 2. 赛道（Game 和小地图都要用它，所以在外面建好再注入） */
const track = new Track(app.scene);

/* 3. UI */
const hud = new Hud();
const overlay = new Overlay();
const minimap = new Minimap(document.getElementById('minimap'), track);
hud.setSoundEnabled(audio.enabled);

/* 4. 输入 */
const input = new Input();

/* 5. 游戏主体：把上面的零件全部交给它调度 */
const game = new Game({
  scene: app.scene,
  camera: app.camera,
  track,
  hud,
  minimap,
  overlay,
  input,
  sunLight: app.sunLight,
  sunDirection: app.sunDirection,
});

/* 6. 界面按钮 → 游戏流程 */
overlay.onStart = () => game.start();
overlay.onRestart = () => game.restart();

/* 7. 跑起来：每帧「逻辑更新 → 画小地图 → 渲染 3D」 */
app.start(
  (dt) => game.update(dt),
  () => game.drawMinimap(),
);

// 方便在浏览器控制台里调试，例如：__game.car.velocity.length()
window.__game = game;
