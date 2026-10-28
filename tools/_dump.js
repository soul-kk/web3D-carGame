import * as THREE from 'three';
import { createApp } from '../src/core/app.js';
import { Track } from '../src/world/track.js';
import { createEnvironment } from '../src/world/environment.js';
import { getMapById } from '../src/world/maps.js';
const out = document.createElement('pre'); out.id='out'; document.body.appendChild(out);
try {
const map = getMapById('volcano');
const app = createApp(document.getElementById('app'));
app.setTheme(map.theme);
const track = new Track(app.scene, map);
createEnvironment(app.scene, track, map.theme);
const byType = {};
for (const c of track.group.children) {
  const g = c.geometry; const p = g?.getAttribute('position');
  if (!p) { byType['(no position) '+(g?.type||'?')] = (byType['(no position) '+(g?.type||'?')]||0)+1; continue; }
  const box = new THREE.Box3().setFromBufferAttribute(p);
  const size = box.getSize(new THREE.Vector3());
  const key = `${g?.type} color=#${c.material?.color?.getHexString?.() ?? '?'} size=${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`;
  byType[key] = (byType[key]||0)+1;
}
out.textContent = JSON.stringify(byType, null, 1);
} catch (e) { out.textContent = 'ERR ' + (e.stack||e); }
