import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { C } from './palette';
import { LINES } from '../world/layout';

export type QualityLevel = 'high' | 'medium' | 'low';

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly clock = new THREE.Clock();

  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private keyLight!: THREE.DirectionalLight;
  private quality: QualityLevel = 'high';
  private shadowSize = 2048;
  private resizeHandler = () => this.resize();

  onUpdate: (dt: number, elapsed: number) => void = () => {};
  onResize: () => void = () => {};

  /** 扣除侧边面板后真正可用的画面区域（CSS 像素） */
  contentWidth = 1;
  contentHeight = 1;
  canvasWidth = 1;
  canvasHeight = 1;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101820);
    this.scene.fog = new THREE.Fog(0x16202b, 150, 460);

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.4,
      700,
    );
    this.camera.position.set(8, 58, 86);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 420;
    this.controls.target.set(0, 4, 0);

    this.buildLights();
    this.buildSky();
    this.buildEnvironment();
    this.buildComposer(container);

    window.addEventListener('resize', this.resizeHandler);
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xd5e4f2, 0x6a6258, 0.72);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1df, 1.65);
    key.position.set(36, 64, 42);
    key.target.position.set(-4, 0, -8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 80;
    key.shadow.camera.bottom = -80;
    key.shadow.camera.near = 8;
    key.shadow.camera.far = 280;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.045;
    this.scene.add(key, key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xb7cff0, 0.52);
    fill.position.set(-48, 28, -18);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd8b0, 0.22);
    rim.position.set(-18, 18, -60);
    this.scene.add(rim);

    // 三条产线各一盏聚光，代替原先沿厂房铺开的十几盏点光源
    for (const line of LINES) {
      const cx = (line.x0 + line.x1) / 2;
      const spot = new THREE.SpotLight(0xfff4e4, 36, 34, Math.PI * 0.32, 0.62, 1.2);
      spot.position.set(cx, 12.4, line.z + 3.2);
      spot.target.position.set(cx, 6.6, line.z);
      this.scene.add(spot, spot.target);
    }
  }

  /** 渐变天幕：天顶偏冷，地平线留一点暖色，避免大面积死黑 */
  private buildSky() {
    const geo = new THREE.SphereGeometry(720, 24, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x1a3146) },
        mid: { value: new THREE.Color(0x31465c) },
        hor: { value: new THREE.Color(0x8a6a52) },
        bot: { value: new THREE.Color(0x12181f) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 bot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(bot, hor, smoothstep(-0.25, 0.02, h));
          c = mix(c, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, top, smoothstep(0.18, 0.72, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, m);
    sky.frustumCulled = false;
    sky.userData.keep = true;
    this.scene.add(sky);
  }

  private buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.62;
    env.dispose?.();
    pmrem.dispose();
  }

  private buildComposer(container: HTMLElement) {
    const samples = this.renderer.capabilities.maxSamples ? Math.min(4, this.renderer.capabilities.maxSamples) : 0;
    const rt = new THREE.WebGLRenderTarget(container.clientWidth, container.clientHeight, {
      type: THREE.HalfFloatType,
      samples,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.32,
      0.48,
      0.86,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setBloomEnabled(on: boolean) {
    this.bloom.enabled = on;
  }

  setQuality(level: QualityLevel) {
    const prevShadows = this.renderer.shadowMap.enabled;
    const dpr = window.devicePixelRatio || 1;
    this.quality = level;
    if (level === 'high') {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.applyShadowSize(2048);
      this.renderer.shadowMap.enabled = true;
      this.bloom.enabled = true;
    } else if (level === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.25));
      this.applyShadowSize(1024);
      this.renderer.shadowMap.enabled = true;
      this.bloom.enabled = false;
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.bloom.enabled = false;
    }
    if (prevShadows !== this.renderer.shadowMap.enabled) this.refreshShadowMaterials();
    this.resize();
  }

  private applyShadowSize(size: number) {
    if (this.shadowSize === size) return;
    this.shadowSize = size;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
  }

  /** 开关阴影会改变标准材质的着色器宏，只在真正切换时重编译一次 */
  private refreshShadowMaterials() {
    const seen = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        if (seen.has(mm)) continue;
        seen.add(mm);
        if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) mm.needsUpdate = true;
      }
    });
  }

  resize() {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.applyViewOffset(w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.onResize();
  }

  /** 侧边面板会遮挡画面，把 3D 视窗向空闲区域偏移 */
  private applyViewOffset(w: number, h: number) {
    const pick = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return 0;
      if (getComputedStyle(el).display === 'none') return 0;
      return el.getBoundingClientRect().width;
    };
    const left = pick('.panel-left');
    const right = pick('.panel-right');
    const top = 70;

    this.canvasWidth = w;
    this.canvasHeight = h;
    this.contentWidth = Math.max(w - left - right, 120);
    this.contentHeight = Math.max(h - top, 120);

    const shiftX = (left - right) / 2;
    const shiftY = -top / 2;
    if (Math.abs(shiftX) > 2 || Math.abs(shiftY) > 2) {
      this.camera.setViewOffset(w, h, -shiftX, shiftY, w, h);
    } else {
      this.camera.clearViewOffset();
    }
  }

  private usePost() {
    return this.quality === 'high' && this.bloom.enabled;
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;
      this.onUpdate(dt, elapsed);
      this.controls.update();
      if (this.usePost()) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
  }
}

export { C };
