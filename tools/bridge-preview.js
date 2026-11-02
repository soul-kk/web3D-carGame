/**
 * 地图预览页（调试用）。
 *
 * 【为什么需要它】断桥长什么样、桥在画面里占多大比例、
 * 车开上去是不是"悬在半空"——这些只能靠眼睛看。
 * 这个页面把某张地图在赛道参数 t 处摆一个机位，渲染一帧，
 * 用无头浏览器截图就能把画面拿出来看，不用手动进游戏跑一圈。
 *
 * 用法：
 *   http://localhost:5173/tools/bridge-preview.html?map=volcano&t=0.42&mode=chase
 *
 * 参数：
 *   map   地图 id（默认 volcano）
 *   t     赛道参数 0~1（默认 0.42，断桥附近）
 *   mode  chase（车后视角）/ low（贴地视角）/ top（俯视）/ side（侧面）
 *   w,h   画面尺寸
 */

import * as THREE from 'three';
import { createApp } from '../src/core/app.js';
import { Track } from '../src/world/track.js';
import { createEnvironment } from '../src/world/environment.js';
import { Coins, BoostPads } from '../src/world/props.js';
import { getMapById } from '../src/world/maps.js';

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'volcano';
const t = Number(params.get('t') ?? 0.42);
const mode = params.get('mode') ?? 'chase';
const width = Number(params.get('w') ?? 1600);
const height = Number(params.get('h') ?? 900);

const app = createApp(document.getElementById('app'));
app.renderer.setSize(width, height);
app.camera.aspect = width / height;
app.camera.updateProjectionMatrix();

const map = getMapById(mapId);
app.setTheme(map.theme);

const track = new Track(app.scene, map);
createEnvironment(app.scene, track, map.theme);
// 道具也一起摆出来（金币 / 加速带），方便看摆位
if (params.get('props') !== '0') {
  new Coins(app.scene, track, map.props?.coins ?? null);
  new BoostPads(app.scene, track, map.props?.boosts ?? null);
}

/** 赛道参数 t 处的路面高度 */
function deckY(tt) {
  return track.heightAt(((tt % 1) + 1) % 1) ?? 0;
}

const p = track.pointAt(t);
const tan = track.tangentAt(t);
const n = track.normalAt(t);
const y = deckY(t) + 0.05;

if (mode === 'chase') {
  // 车后视角：跟游戏里的跟车镜头差不多
  app.camera.position.set(p.x - tan.x * 11, y + 4.6, p.z - tan.z * 11);
  app.camera.lookAt(p.x + tan.x * 8, y + 1.6, p.z + tan.z * 8);
} else if (mode === 'low') {
  // 贴地视角：看桥面边缘和下面的深渊
  app.camera.position.set(p.x - tan.x * 14, y + 1.4, p.z - tan.z * 14);
  app.camera.lookAt(p.x + tan.x * 10, y + 0.6, p.z + tan.z * 10);
} else if (mode === 'side') {
  // 侧面：看桥的横截面
  app.camera.position.set(p.x + n.x * 55, y + 12, p.z + n.z * 55);
  app.camera.lookAt(p.x, y, p.z);
} else {
  // 俯视
  app.camera.position.set(p.x, y + 120, p.z);
  app.camera.lookAt(p.x, y, p.z);
}

// 太阳跟着车走，不然阴影不对
app.sunLight.target.position.set(p.x, 0, p.z);
app.sunLight.position.set(p.x + 60, 90, p.z + 60);
app.sunLight.target.updateMatrixWorld();

app.renderer.render(app.scene, app.camera);
window.__ready = true;
