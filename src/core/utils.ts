import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from './palette';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const glassCache = new Map<string, THREE.MeshPhysicalMaterial>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

/**
 * 标准材质工厂。相同外观共用一份材质，避免每颗螺栓都新建一份。
 * 带贴图或自发光的材质不进缓存，调用方可以独立改 offset / 亮度。
 */
export function mat(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  const roughness = opts.roughness ?? 0.62;
  const metalness = opts.metalness ?? 0.12;
  const transparent = opts.transparent ?? false;
  const opacity = opts.opacity ?? 1;
  const side = opts.side ?? THREE.FrontSide;
  const depthWrite = opts.depthWrite !== false;
  if (opts.map || opts.normalMap || opts.alphaMap || opts.envMap || opts.emissive || opts.vertexColors) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent,
      opacity,
      side,
      depthWrite,
      ...opts,
    });
  }
  const key = `${color}|${roughness}|${metalness}|${transparent ? 1 : 0}|${opacity}|${side}|${depthWrite ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent, opacity, side, depthWrite });
    matCache.set(key, m);
  }
  return m;
}

export interface BoxOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  cast?: boolean;
  receive?: boolean;
}

/** 细杆、薄板不进阴影贴图，避免阴影通道被螺栓填满 */
function wantsCast(explicit: boolean | undefined, dims: number[]) {
  if (explicit === false) return false;
  if (explicit === true) return true;
  const s = [...dims].sort((a, b) => a - b);
  return s[0] >= 0.12 && s[1] >= 0.12;
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
  mesh.castShadow = wantsCast(opts.cast, [w, h, d]);
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
  const r = Math.max(rt, rb);
  mesh.castShadow = wantsCast(opts.cast, [r * 2, r * 2, h]);
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

/** 水平圆环，用于栏杆、法兰、风机护罩 */
export function torus(
  parent: THREE.Object3D,
  radius: number,
  tube: number,
  m: THREE.Material,
  opts: BoxOpts = {},
): THREE.Mesh {
  const geo = cached(`o:${radius},${tube}`, () => new THREE.TorusGeometry(radius, tube, 6, 16));
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = opts.cast === true;
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
  const geo = cached(`s:${r}`, () => new THREE.SphereGeometry(r, 18, 12));
  const mesh = new THREE.Mesh(geo, m);
  if (opts.pos) mesh.position.set(...opts.pos);
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = wantsCast(opts.cast, [r * 2, r * 2, r * 2]);
  mesh.receiveShadow = opts.receive !== false;
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

/** 发光材质（状态灯、屏幕）。默认独立实例，方便逐盏改亮度。 */
export function emissive(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
  });
}

/** 静态发光件可以共用，便于合批 */
const emissiveSharedCache = new Map<string, THREE.MeshStandardMaterial>();
export function emissiveShared(color: number, intensity = 1.4): THREE.MeshStandardMaterial {
  const key = `${color}|${intensity}`;
  let m = emissiveSharedCache.get(key);
  if (!m) {
    m = emissive(color, intensity);
    emissiveSharedCache.set(key, m);
  }
  return m;
}

/** 简易加法混合的玻璃 */
export function glassMaterial(color = C.glass, opacity = 0.28): THREE.MeshPhysicalMaterial {
  const key = `${color}|${opacity}`;
  let m = glassCache.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity,
      transmission: 0,
      side: THREE.DoubleSide,
    });
    glassCache.set(key, m);
  }
  return m;
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 平滑步进 */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/** 角度阻尼，处理 ±π 回绕，避免车头在拐角抽一下 */
export function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const k = 1 - Math.exp(-lambda * Math.max(dt, 0));
  return current + delta * k;
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

function protectedNode(obj: THREE.Object3D) {
  let p: THREE.Object3D | null = obj;
  while (p) {
    const u = p.userData;
    if (u.keep || u.dynamic || u.spin || u.bob || u.noMerge) return true;
    p = p.parent;
  }
  return false;
}

/**
 * 把静止、同材质、无贴图的网格烘焙成少量大网格。
 * 运动部件、玻璃、自发光和带贴图的表面会留在原来的层级里。
 */
export function mergeStaticMeshes(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();

  interface Bucket {
    material: THREE.Material;
    geos: THREE.BufferGeometry[];
    meshes: THREE.Mesh[];
    cast: boolean;
    receive: boolean;
  }
  const buckets = new Map<string, Bucket>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (protectedNode(mesh)) return;
    if (Array.isArray(mesh.material)) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material?.isMeshStandardMaterial) return;
    if (material.transparent || material.opacity < 0.999) return;
    if (material.map || material.normalMap || material.alphaMap) return;
    if (material.emissive && material.emissive.r + material.emissive.g + material.emissive.b > 0) return;

    const g = mesh.geometry.clone();
    rel.multiplyMatrices(invRoot, mesh.matrixWorld);
    g.applyMatrix4(rel);
    const key = `${material.uuid}|${mesh.castShadow ? 'c' : 'n'}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material, geos: [], meshes: [], cast: mesh.castShadow, receive: false };
      buckets.set(key, b);
    }
    b.geos.push(g);
    b.meshes.push(mesh);
    b.receive = b.receive || mesh.receiveShadow;
  });

  let batches = 0;
  let mergedMeshes = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) {
      b.geos.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = 'static-batch';
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    for (const src of b.meshes) src.parent?.remove(src);
    root.add(mesh);
    batches++;
    mergedMeshes += b.meshes.length;
  }
  return { batches, mergedMeshes };
}
