import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { C } from './palette';

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly clock = new THREE.Clock();

  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
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
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f15);
    this.scene.fog = new THREE.Fog(0x121a24, 260, 620);

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.5,
      600,
    );
    this.camera.position.set(8, 58, 86);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
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
    const hemi = new THREE.HemisphereLight(0xcfdcec, 0x555c66, 0.5);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff3e0, 1.45);
    key.position.set(34, 48, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -90;
    key.shadow.camera.right = 90;
    key.shadow.camera.top = 50;
    key.shadow.camera.bottom = -50;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 220;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.022;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa8c6ff, 0.38);
    fill.position.set(-40, 26, -30);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd7b0, 0.28);
    rim.position.set(-10, 14, -48);
    this.scene.add(rim);

    // 沿北墙产线、中央通道、南墙产线布灯
    for (const z of [-24, 0, 22]) {
      for (let x = -60; x <= 60; x += 30) {
        const p = new THREE.PointLight(z === 0 ? 0xffeed6 : 0xe7f0ff, 8, 32, 2);
        p.position.set(x, 11.4, z);
        this.scene.add(p);
      }
    }
  }

  /** 渐变天幕，避免大面积死黑 */
  private buildSky() {
    const geo = new THREE.SphereGeometry(720, 24, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x1b2836) },
        mid: { value: new THREE.Color(0x243244) },
        bot: { value: new THREE.Color(0x0d1219) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(bot, mid, smoothstep(-0.35, 0.02, h));
          c = mix(c, top, smoothstep(0.0, 0.75, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, m);
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.42;
    env.dispose?.();
    pmrem.dispose();
  }

  private buildComposer(container: HTMLElement) {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.42,
      0.6,
      0.92,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setBloomEnabled(on: boolean) {
    this.bloom.enabled = on;
  }

  setQuality(level: 'high' | 'medium' | 'low') {
    const dpr = window.devicePixelRatio;
    if (level === 'high') this.renderer.setPixelRatio(Math.min(dpr, 2));
    else if (level === 'medium') this.renderer.setPixelRatio(Math.min(dpr, 1.25));
    else this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = level !== 'low';
    this.bloom.enabled = level === 'high';
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mm of mats) {
          if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            (mm as THREE.MeshStandardMaterial).needsUpdate = true;
          }
        }
      }
    });
    this.resize();
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

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;
      this.onUpdate(dt, elapsed);
      this.controls.update();
      this.composer.render();
    };
    loop();
  }

  dispose() {
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
  }
}

export { C };
