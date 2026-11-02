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
import { loadSkin } from './game/skins.js';
import { getMapById, loadMap } from './world/maps.js';

/* 1. 舞台：渲染器 / 场景 / 相机 / 光照 / 天空 */
const app = createApp(document.getElementById('app'));

/**
 * URL 参数（调试用）：
 *   ?map=volcano   直接进这张图，不读上次选的那张
 *   ?t=0.75        直接开赛，并把车放到赛道参数 t 处（0~1）
 *
 * 【为什么需要】断桥、上坡这种东西只有在一小段路上才看得到，
 * 每次都从起点跑过去太慢 —— 改地图时用 `?map=volcano&t=0.75`
 * 一秒就能站到断桥上。
 */
const params = new URLSearchParams(location.search);

/* 2. 地图（读取上次选的那张：形状 + 主题 + 配乐都在这儿） */
const map = getMapById(params.get('map') ?? loadMap());

/* 3. 赛道（Game 和小地图都要用它，所以在外面建好再注入） */
const track = new Track(app.scene, map);

/* 4. UI */
const hud = new Hud();
const overlay = new Overlay();
const minimap = new Minimap(document.getElementById('minimap'), track);
hud.setSoundEnabled(audio.enabled);

/* 5. 输入 */
const input = new Input();

/* 6. 游戏主体：把上面的零件全部交给它调度 */
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
  skinId: loadSkin(),          // 读取上次选的车
  map,                         // 当前地图
  onThemeChange: (theme) => app.setTheme(theme),
});

/* 7. 界面按钮 → 游戏流程 */
overlay.onStart = () => {
  game.start();
  // 调试直达：?t=0.75 时，等镜头过渡完（1.8 s）把车放到指定位置
  if (Number.isFinite(jumpT)) setTimeout(() => game.debugPlaceAt(jumpT), 2200);
};
overlay.onRestart = () => game.restart();
overlay.onReturn = () => game.returnToMenu();
overlay.onSkinChange = (skinId) => game.setSkin(skinId);
overlay.onMapChange = (mapId) => {
  game.setMap(mapId);
  // 换完地图回主界面，让玩家直接看到新赛道长什么样
  overlay.showMenu();
};
// 设置里的两条音量滑杆：直接读写 audio 模块（会存盘）
overlay.getVolumes = () => audio.volumes;
overlay.onVolumeChange = (kind, value) => audio.setVolume(kind, value);

/* 7. 跑起来：每帧「逻辑更新 → 画小地图 → 渲染 3D」 */
app.start(
  (dt) => game.update(dt),
  () => game.drawMinimap(),
);

// 方便在浏览器控制台里调试，例如：__game.car.velocity.length()
window.__game = game;
// 音频实例也挂出来：调音量 / 查当前曲子时不用再 import 一次（HMR 下 import 会拿到新实例）
window.__audio = audio;

/* 8. 调试直达：?t=0.75 时，玩家点「开始游戏」后车直接落到赛道参数 t 处 */
const jumpT = Number(params.get('t'));
