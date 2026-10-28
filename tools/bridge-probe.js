/**
 * 断桥可见性探针（调试用）。
 *
 * 从桥面上方垂直往下打射线，看第一个命中的是不是路面、命中高度对不对；
 * 再从"驾驶员眼睛"的高度沿赛道方向往前打射线，看桥面是不是挡在前面。
 * 有东西盖住桥面时，这两条射线会先命中别的东西。
 *
 * 用法：node tools/bridge-probe.js   （配合无头浏览器跑，见 tools/bridge-check.html）
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
  app.scene.updateMatrixWorld(true);

  const ray = new THREE.Raycaster();
  ray.far = 500;
  const label = (obj) => {
    if (!obj) return 'none';
    const p = obj.geometry?.getAttribute('position');
    const color = obj.material?.color ? `#${obj.material.color.getHexString()}` : '-';
    const y = obj.position.y;
    return `${obj.type}[verts=${p?.count ?? 0} color=${color} y=${y.toFixed(2)}]`;
  };

  /** 从正上方往下打 */
  const down = [];
  for (let t = 0.66; t <= 0.90; t += 0.01) {
    const p = track.pointAt(t);
    const deck = track.heightAt(t);
    ray.set(new THREE.Vector3(p.x, 60, p.z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(app.scene.children, true).filter((h) => h.object.visible);
    const first = hits[0];
    down.push({
      t: +t.toFixed(3),
      deck: deck === null ? null : +deck.toFixed(2),
      hitY: first ? +first.point.y.toFixed(2) : null,
      hit: label(first?.object),
      covered: first && deck !== null ? +(deck - first.point.y).toFixed(2) : null,
    });
  }
  report.fromAbove = down;

  /** 从驾驶员眼睛沿赛道方向往前打 */
  const forward = [];
  for (let t = 0.67; t <= 0.86; t += 0.01) {
    const p = track.pointAt(t);
    const tan = track.tangentAt(t);
    const deck = track.heightAt(t);
    if (deck === null) { forward.push({ t: +t.toFixed(3), gap: true }); continue; }
    const eye = new THREE.Vector3(p.x, deck + 1.2, p.z);
    ray.set(eye, new THREE.Vector3(tan.x, 0, tan.z));
    const hits = ray.intersectObjects(app.scene.children, true).filter((h) => h.object.visible);
    const first = hits[0];
    forward.push({
      t: +t.toFixed(3),
      deck: +deck.toFixed(2),
      dist: first ? +first.distance.toFixed(1) : null,
      hit: label(first?.object),
    });
  }
  report.forward = forward;

  report.ok = true;
} catch (err) {
  report.ok = false;
  report.errors.push(String(err && err.stack ? err.stack : err));
}

out.textContent = JSON.stringify(report, null, 1);
document.title = 'done';
