import * as THREE from 'three';
import { C } from './palette';

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

/** 标准材质工厂 */
export function mat(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.12,
    ...opts,
  });
}

export interface BoxOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  cast?: boolean;
  receive?: boolean;
}

/** 添加一个立方体网格 */
export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  opts: BoxOpts = {},
): THREE.Mesh {
  const geo = cached(`b:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

export function cyl(
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  h: number,
  seg: number,
  m: THREE.Material,
  opts: BoxOpts = {},
): THREE.Mesh {
  const geo = cached(`c:${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

/** 球体 */
export function sphere(
  parent: THREE.Object3D,
  r: number,
  m: THREE.Material,
  opts: BoxOpts = {},
): THREE.Mesh {
  const geo = cached(`s:${r}`, () => new THREE.SphereGeometry(r, 20, 14));
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  mesh.castShadow = opts.cast !== false;
  parent.add(mesh);
  return mesh;
}

/** 由二维轮廓挤出的板件，用于异形钣金外壳 */
export function extrude(
  parent: THREE.Object3D,
  shape: THREE.Shape,
  depth: number,
  m: THREE.Material,
  opts: BoxOpts = {},
): THREE.Mesh {
  const key = `e:${depth}:${shape.getPoints(24).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|')}`;
  const geo = cached(key, () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
    g.center();
    return g;
  });
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

/** 圆角矩形 Shape */
export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** 发光材质（用于状态灯、屏幕） */
export function emissive(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
  });
}

/** 简易加法混合的玻璃 */
export function glassMaterial(color = C.glass, opacity = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity,
    transmission: 0,
    side: THREE.DoubleSide,
  });
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 平滑步进 */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** 生成一条圆滑路径 */
export function curveThrough(points: THREE.Vector3[], tension = 0): THREE.CatmullRomCurve3 {
  const pts = points.map((p) => p.clone());
  if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0, 0, 0.01)));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', tension);
}
