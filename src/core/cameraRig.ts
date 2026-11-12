import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { easeInOutCubic } from './utils';

export interface CameraPreset {
  id: string;
  name: string;
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/** 预设机位：覆盖全流程的关键视角 */
export const PRESETS: CameraPreset[] = [
  {
    id: 'overview',
    name: '全景鸟瞰',
    pos: new THREE.Vector3(48, 62, 72),
    target: new THREE.Vector3(0, 4, 0),
  },
  {
    id: 'receiving',
    name: '来料收货区',
    pos: new THREE.Vector3(-78, 16, 34),
    target: new THREE.Vector3(-60, 2, 14),
  },
  {
    id: 'raw',
    name: '原料库',
    pos: new THREE.Vector3(-78, 16, 6),
    target: new THREE.Vector3(-62, 2, -12),
  },
  {
    id: 'lift',
    name: '原料提升',
    pos: new THREE.Vector3(-50, 16, -6),
    target: new THREE.Vector3(-43, 6, -22),
  },
  {
    id: 'lineA',
    name: '合成线 A',
    pos: new THREE.Vector3(-26, 16, -8),
    target: new THREE.Vector3(-26, 8, -24),
  },
  {
    id: 'lineB',
    name: '复配线 B',
    pos: new THREE.Vector3(14, 16, -8),
    target: new THREE.Vector3(14, 8, -24),
  },
  {
    id: 'lineC',
    name: '灌装线 C',
    pos: new THREE.Vector3(54, 16, -8),
    target: new THREE.Vector3(54, 8, -24),
  },
  {
    id: 'ship',
    name: '成品库与发运',
    pos: new THREE.Vector3(78, 18, 24),
    target: new THREE.Vector3(62, 2, 8),
  },
  {
    id: 'office',
    name: '办公楼',
    pos: new THREE.Vector3(78, 16, 36),
    target: new THREE.Vector3(54, 4, 18),
  },
];

/**
 * 全景机位：按当前视口宽高比自动计算机位距离，
 * 保证整座车间始终完整落在未被面板遮挡的可视区域内。
 */
const OVERVIEW = {
  dir: new THREE.Vector3(0.372, 0.669, 0.643).normalize(),
  target: new THREE.Vector3(0, 4, 0),
  // 150m × 60m 车间，预留近端透视放大余量
  fitWidth: 210,
  fitHeight: 130,
};

/**
 * 依据画布比例与「未被面板遮挡的有效区域」计算全景机位，
 * 保证整座车间始终完整落在可视区域内。
 */
export function overviewPose(
  camera: THREE.PerspectiveCamera,
  canvasW = camera.aspect,
  canvasH = 1,
  contentW = canvasW,
  contentH = canvasH,
): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const vHalfFull = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hHalfFull = Math.atan(Math.tan(vHalfFull) * camera.aspect);
  // 有效区域在画布中所占比例 → 对应的视角张角
  const hHalf = Math.atan(Math.tan(hHalfFull) * (contentW / canvasW));
  const vHalf = Math.atan(Math.tan(vHalfFull) * (contentH / canvasH));
  const dist = Math.max(
    OVERVIEW.fitWidth / 2 / Math.tan(hHalf),
    OVERVIEW.fitHeight / 2 / Math.tan(vHalf),
  );
  return {
    pos: OVERVIEW.target.clone().addScaledVector(OVERVIEW.dir, dist),
    target: OVERVIEW.target.clone(),
  };
}

export class CameraRig {
  private flight: {
    t: number;
    dur: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  private lastOverview: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private viewport: () => {
      canvasW: number;
      canvasH: number;
      contentW: number;
      contentH: number;
    },
  ) {}

  private pose() {
    const v = this.viewport();
    return overviewPose(this.camera, v.canvasW, v.canvasH, v.contentW, v.contentH);
  }

  flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 1.5) {
    this.flight = {
      t: 0,
      dur,
      fromPos: this.camera.position.clone(),
      toPos: pos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
  }

  flyToPreset(p: CameraPreset, dur = 1.6) {
    if (p.id === 'overview') {
      const pose = this.pose();
      this.lastOverview = pose;
      this.flyTo(pose.pos, pose.target, dur);
      return;
    }
    this.flyTo(p.pos, p.target, dur);
  }

  /** 视口尺寸变化时重新贴合全景机位 */
  refitOverview() {
    const pose = this.pose();
    this.camera.position.copy(pose.pos);
    this.controls.target.copy(pose.target);
    this.lastOverview = pose;
  }

  /** 仅当用户仍停留在全景机位附近时才重新贴合，避免打断手动操作 */
  maybeRefitOverview() {
    if (!this.lastOverview) return;
    const prev = this.lastOverview;
    const dist = prev.pos.distanceTo(prev.target);
    if (this.camera.position.distanceTo(prev.pos) > dist * 0.12) return;
    this.refitOverview();
  }

  update(dt: number) {
    if (!this.flight) return;
    const f = this.flight;
    f.t += dt;
    const k = easeInOutCubic(Math.min(f.t / f.dur, 1));
    this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    if (f.t >= f.dur) this.flight = null;
  }

  get isFlying() {
    return this.flight !== null;
  }
}
