import * as THREE from 'three';
import { CAMERA, WORLD } from '../config.js';

/**
 * 搭建渲染器 / 场景 / 相机 / 光照 / 天空，并提供主循环。
 * 这里只关心"舞台"，不含任何游戏逻辑。
 */
export function createApp(container) {
  /* ---------- 渲染器 ---------- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  /* ---------- 场景 & 相机 ---------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(WORLD.fog.color, WORLD.fog.near, WORLD.fog.far);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    0.5,
    4000,
  );
  camera.position.set(0, 8, -16);

  /* ---------- 光照 ---------- */
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a8f3c, 1.05));

  const sunDirection = new THREE.Vector3(...WORLD.sunDirection).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.9);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, {
    left: -WORLD.shadowRadius,
    right: WORLD.shadowRadius,
    top: WORLD.shadowRadius,
    bottom: -WORLD.shadowRadius,
    near: 1,
    far: 400,
  });
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight, sunLight.target);

  /* ---------- 天空 & 太阳 ---------- */
  buildSky(scene, sunDirection);

  /* ---------- 自适应窗口 ---------- */
  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  /* ---------- 主循环 ---------- */
  const clock = new THREE.Clock();

  /**
   * 启动渲染循环。
   * @param {(dt:number)=>void} update 每帧回调，dt 已做上限保护（秒）
   * @param {()=>void} [beforeRender] 渲染前的回调（例如更新 HUD）
   */
  function start(update, beforeRender) {
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.033);
      update(dt);
      if (beforeRender) beforeRender();
      renderer.render(scene, camera);
    });
  }

  return { renderer, scene, camera, sunLight, sunDirection, start };
}

/* ------------------------------------------------------------------ */

function buildSky(scene, sunDirection) {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(WORLD.sky.top) },
      bottomColor: { value: new THREE.Color(WORLD.sky.bottom) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float k = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 1.4);
        gl_FragColor = vec4(mix(bottomColor, topColor, k), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMaterial);
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(46, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xfff5b8, fog: false }),
  );
  sun.position.copy(sunDirection).multiplyScalar(1050);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(90, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0xfff0a0, transparent: true, opacity: 0.22, fog: false,
    }),
  );
  glow.position.copy(sun.position);

  scene.add(sun, glow);
}
