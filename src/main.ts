import './style.css';
import * as THREE from 'three';
import { App } from './core/app';
import { CameraRig } from './core/cameraRig';
import { buildFactory } from './world/factory';
import { FlowController } from './flow/flow';
import { UI } from './ui/ui';

const viewport = document.getElementById('viewport') as HTMLElement;

const app = new App(viewport);
const factory = buildFactory(app.scene);
const flow = new FlowController(factory);
const rig = new CameraRig(app.camera, app.controls, () => ({
  canvasW: app.canvasWidth,
  canvasH: app.canvasHeight,
  contentW: app.contentWidth,
  contentH: app.contentHeight,
}));
const ui = new UI({ app, factory, flow, rig });
app.resize();

rig.refitOverview();
app.onResize = () => rig.maybeRefitOverview();

app.onUpdate = (dt, elapsed) => {
  flow.update(dt);
  factory.update(dt, elapsed);
  rig.update(dt);
  ui.update(dt);
};

app.start();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__factory = { app, factory, flow, rig };
}

/* ---------------- 场景拾取：点击设备定位到对应工位 ---------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt: { x: number; y: number } | null = null;

app.renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});

app.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 5) return;

  const rect = app.renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, app.camera);
  const hits = raycaster.intersectObjects(factory.hits, false);
  if (hits.length) {
    const id = hits[0].object.userData.stationId as string;
    ui.selectById(id);
  }
});

/* ---------------- 载入完成 ---------------- */
requestAnimationFrame(() => {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('hide');
  window.setTimeout(() => loader.remove(), 800);
});
