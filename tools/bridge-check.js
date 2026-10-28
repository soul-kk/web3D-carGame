/**
 * 断桥结构自检页（调试用）。
 *
 * 【为什么需要它】"桥面到底有没有生成"这种问题，肉眼看会被雾、光照、
 * 镜头角度一起骗过去。这里改成直接读运行时的几何体数据：
 *   - 路面网格在桥区间的顶点高度
 *   - 断口区间有没有三角形
 *   - 腹板 / 护栏 / 桥墩各建了多少
 * 结论写进页面里，无头浏览器 --dump-dom 就能拿到。
 *
 * 用法：
 *   http://localhost:5174/tools/bridge-check.html?map=volcano
 */

import * as THREE from 'three';
import { createApp } from '../src/core/app.js';
import { Track } from '../src/world/track.js';
import { createEnvironment } from '../src/world/environment.js';
import { getMapById } from '../src/world/maps.js';

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'volcano';
const out = document.createElement('pre');
out.id = 'out';
document.body.appendChild(out);

const report = { map: mapId, errors: [] };
window.addEventListener('error', (e) => report.errors.push(String(e.message)));

try {
  const map = getMapById(mapId);
  const app = createApp(document.getElementById('app'));
  app.setTheme(map.theme);
  const track = new Track(app.scene, map);
  createEnvironment(app.scene, track, map.theme);

  const b = map.bridge;
  report.bridge = b ?? null;
  report.totalLength = +track.totalLength.toFixed(2);

  /* 路面网格：找出它，看每个顶点的高度 */
  const road = track.group.children.find((c) => c.isMesh && c.geometry?.getAttribute('position'));
  const pos = road.geometry.getAttribute('position');
  const index = road.geometry.getIndex();
  report.roadVertices = pos.count;
  report.roadTriangles = index.count / 3;

  /* 按采样点序号反查 t，把顶点高度和桥区间对上 */
  const N = track.count;
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const h = track.heightAt(t);
    if (h === null) continue;
    rows.push({ t: +t.toFixed(4), h: +h.toFixed(2) });
  }
  const bridgeRows = rows.filter((r) => r.t >= (b?.from ?? 0) && r.t <= (b?.to ?? 0));
  report.bridgeRows = bridgeRows.length;
  report.deckProfile = [];
  for (let t = (b?.from ?? 0); t <= (b?.to ?? 0); t += 0.01) {
    const tt = Math.min(t, b?.to ?? 1);
    const h = track.heightAt(tt);
    report.deckProfile.push({
      t: +tt.toFixed(3),
      h: h === null ? null : +h.toFixed(2),
      y: h === null ? null : +(h + 0.05).toFixed(2),
    });
  }

  /* 断口区间有没有三角形：把路面三角形投影回 t，看有没有跨过 gap */
  const gapTris = [];
  for (let k = 0; k < index.count; k += 3) {
    const a = index.getX(k), bb = index.getX(k + 1), c = index.getX(k + 2);
    /* 顶点按 i*2 排（左、右），i = floor(vertex/2) */
    const ts = [a, bb, c].map((v) => Math.floor(v / 2) / N);
    if (ts.some((t) => t >= b.gapFrom - 0.001 && t <= b.gapTo + 0.001)) {
      gapTris.push(ts.map((t) => +t.toFixed(4)));
    }
  }
  report.trianglesInsideGap = gapTris.length;

  /* 桥的"骨头"：数一数各种零件 */
  const counts = { meshes: 0, piers: 0, rails: 0, posts: 0, hazard: 0, glow: 0, shards: 0 };
  for (const child of track.group.children) {
    if (!child.isMesh) continue;
    counts.meshes++;
    const geo = child.geometry;
    const p = geo.getAttribute('position');
    if (!p) continue;
    const box = new THREE.Box3().setFromBufferAttribute(p);
    const size = box.getSize(new THREE.Vector3());
    /* 桥墩：竖长条 */
    if (size.y > 2 && size.x < 5 && size.z < 5 && p.count <= 8) counts.piers++;
    /* 立柱：细高条 */
    else if (size.y > 1 && size.y < 2.5 && size.x < 0.6 && p.count <= 8) counts.posts++;
    /* 护栏 / 腹板：长的竖片 */
    else if (p.count > 100 && size.y > 0.5) counts.rails++;
    /* 警戒条：薄的片 */
    else if (p.count > 50 && size.y < 1) counts.hazard++;
  }
  report.parts = counts;

  /* 整组包围盒：桥有没有真的"架高" */
  const box = new THREE.Box3();
  for (const child of track.group.children) {
    if (!child.isMesh) continue;
    child.updateMatrixWorld(true);
    box.expandByObject(child);
  }
  report.bounds = {
    minY: +box.min.y.toFixed(2),
    maxY: +box.max.y.toFixed(2),
    sizeY: +box.getSize(new THREE.Vector3()).y.toFixed(2),
  };

  app.renderer.render(app.scene, app.camera);
  report.ok = true;
} catch (err) {
  report.ok = false;
  report.errors.push(String(err && err.stack ? err.stack : err));
}

out.textContent = JSON.stringify(report, null, 1);
document.title = 'done';
