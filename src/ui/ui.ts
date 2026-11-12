import type { App } from '../core/app';
import type { CameraRig } from '../core/cameraRig';
import { PRESETS } from '../core/cameraRig';
import type { Factory, Station } from '../world/factory';
import type { FlowController } from '../flow/flow';
import { GROUPS } from '../world/layout';
import { hourlyOutput, deviceHealth } from '../data/mock';
import { STATUS_TEXT } from '../core/palette';

const el = (tag: string, cls?: string, html?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

export interface UIHooks {
  app: App;
  factory: Factory;
  flow: FlowController;
  rig: CameraRig;
}

export class UI {
  private root: HTMLElement;
  private rows = new Map<string, HTMLElement>();
  private kpi: Record<string, HTMLElement> = {};
  private chart!: HTMLCanvasElement;
  private clockEl!: HTMLElement;
  private tourTimer = 0;
  private tourOn = false;
  private tourIndex = 0;
  private acc = 0;

  constructor(private h: UIHooks) {
    this.root = document.getElementById('ui')!;
    this.buildTop();
    this.buildLeft();
    this.buildRight();
    this.buildBottom();
    this.select('overview');
  }

  /* ------------------------------ 顶栏 ------------------------------ */
  private buildTop() {
    const bar = el('div', 'topbar glass');
    bar.innerHTML = `
      <div class="brand">
        <div class="brand-mark">厂</div>
        <div>
          <div class="brand-title">智能工厂 · 全流程三维仿真</div>
          <div class="brand-sub">来料暂存 → IQC → 原料仓 → 上料 → 加工 → 装配 → OQC → 包装码垛 → 成品入库</div>
        </div>
      </div>
      <div class="topbar-spacer"></div>
      <div class="topstat"><span class="dot"></span><span>设备在线 <b id="kpi-online">—</b></span></div>
      <div class="topstat"><span class="dot warn"></span><span>在制品 <b id="kpi-wip">—</b></span></div>
      <div class="topstat"><span class="dot" style="background:#4a9eff;color:#4a9eff"></span><span>AGV <b id="kpi-agv">—</b></span></div>
      <div class="clock" id="clock">--:--:--</div>
    `;
    this.root.appendChild(bar);
    this.kpi.online = bar.querySelector('#kpi-online')!;
    this.kpi.wip = bar.querySelector('#kpi-wip')!;
    this.kpi.agv = bar.querySelector('#kpi-agv')!;
    this.clockEl = bar.querySelector('#clock')!;
  }

  /* ------------------------------ 工艺树 ------------------------------ */
  private buildLeft() {
    const panel = el('div', 'panel panel-left glass');
    const head = el('div', 'panel-head');
    head.innerHTML = `<span class="panel-title">生产流程 · 实时状态</span><span class="panel-tag">Process Flow</span>`;
    panel.appendChild(head);

    const body = el('div', 'panel-body');
    const order = this.h.factory.stations;
    let idx = 0;
    for (const g of GROUPS) {
      body.appendChild(el('div', 'flow-group', g.name));
      for (const st of order.filter((s) => s.group === g.id)) {
        idx++;
        const row = el('div', 'station');
        row.innerHTML = `
          <div class="station-idx">${idx}</div>
          <div class="station-main">
            <div class="station-name">${st.name}</div>
            <div class="station-meta"><span>${st.code}</span><span>·</span><span class="wip">0 件</span></div>
          </div>
          <div class="station-state s-idle">待机</div>
        `;
        row.addEventListener('click', () => this.focusStation(st));
        body.appendChild(row);
        this.rows.set(st.id, row);
      }
    }
    panel.appendChild(body);
    this.root.appendChild(panel);
  }

  /* ------------------------------ 看板 ------------------------------ */
  private buildRight() {
    const panel = el('div', 'panel panel-right glass');
    const head = el('div', 'panel-head');
    head.innerHTML = `<span class="panel-title">生产看板</span><span class="panel-tag">Dashboard</span>`;
    panel.appendChild(head);

    const body = el('div', 'panel-body');
    body.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">今日入库</div><div class="kpi-value" id="kpi-prod">0<span class="kpi-unit">垛</span></div><div class="kpi-trend up">▲ 目标 120 垛</div></div>
        <div class="kpi"><div class="kpi-label">在制品</div><div class="kpi-value" id="kpi-wip2">0<span class="kpi-unit">件</span></div><div class="kpi-trend">线边 6 工位</div></div>
        <div class="kpi"><div class="kpi-label">平均节拍</div><div class="kpi-value" id="kpi-cycle">0<span class="kpi-unit">s</span></div><div class="kpi-trend up">▲ 优于目标 8%</div></div>
        <div class="kpi"><div class="kpi-label">设备综合效率</div><div class="kpi-value" id="kpi-oee">0<span class="kpi-unit">%</span></div><div class="kpi-trend up">▲ 较昨日 +2.4</div></div>
        <div class="kpi"><div class="kpi-label">一次合格率</div><div class="kpi-value" id="kpi-qc">0<span class="kpi-unit">%</span></div><div class="kpi-trend up">▲ 目标 98.5%</div></div>
        <div class="kpi"><div class="kpi-label">设备在线率</div><div class="kpi-value" id="kpi-onliner">0<span class="kpi-unit">%</span></div><div class="kpi-trend">12 台关键设备</div></div>
      </div>
      <div class="section">
        <div class="section-title">近 12 小时产出</div>
        <canvas id="chart"></canvas>
      </div>
      <div class="section">
        <div class="section-title">关键设备 OEE</div>
        <div id="devlist"></div>
      </div>
    `;
    panel.appendChild(body);
    this.root.appendChild(panel);

    for (const id of ['prod', 'wip2', 'cycle', 'oee', 'qc', 'onliner']) {
      this.kpi[id] = body.querySelector(`#kpi-${id}`)!;
    }
    this.chart = body.querySelector('#chart')!;

    const devlist = body.querySelector('#devlist')!;
    for (const d of deviceHealth) {
      const row = el('div', 'bar-row');
      row.innerHTML = `<span class="bar-label">${d.id}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${d.oee}%;background:linear-gradient(90deg,#ff8a2b,#ffb020)"></span></span>
        <span class="bar-val">${d.oee}%</span>`;
      devlist.appendChild(row);
    }

    this.drawChart();
  }

  /* ------------------------------ 底栏 ------------------------------ */
  private buildBottom() {
    const bar = el('div', 'bottombar glass');

    const play = el('button', 'btn primary', '⏸ 暂停');
    play.addEventListener('click', () => {
      this.h.flow.paused = !this.h.flow.paused;
      play.innerHTML = this.h.flow.paused ? '▶ 继续' : '⏸ 暂停';
      play.classList.toggle('primary', !this.h.flow.paused);
    });

    const speeds = el('div', 'btn-group');
    const mkSpeed = (v: number, label: string) => {
      const b = el('button', 'btn' + (v === 1 ? ' on' : ''), label);
      b.addEventListener('click', () => {
        this.h.flow.timeScale = v;
        speeds.querySelectorAll('.btn').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
      });
      speeds.appendChild(b);
    };
    mkSpeed(0.5, '0.5×');
    mkSpeed(1, '1×');
    mkSpeed(2, '2×');
    mkSpeed(4, '4×');

    const tour = el('button', 'btn', '◎ 巡检');
    tour.addEventListener('click', () => {
      this.tourOn = !this.tourOn;
      tour.classList.toggle('on', this.tourOn);
      if (this.tourOn) {
        this.tourIndex = 0;
        this.tourTimer = 0;
        this.applyPreset(0);
      }
    });

    const reset = el('button', 'btn', '⌂ 全景');
    reset.addEventListener('click', () => {
      this.tourOn = false;
      tour.classList.remove('on');
      this.applyPreset(0);
    });

    const bloom = el('button', 'btn on', '✦ 辉光');
    bloom.addEventListener('click', () => {
      this.bloomOn = !this.bloomOn;
      this.h.app.setBloomEnabled(this.bloomOn);
      bloom.classList.toggle('on', this.bloomOn);
    });

    const quality = el('div', 'btn-group');
    const mkQ = (q: 'high' | 'medium' | 'low', label: string) => {
      const b = el('button', 'btn' + (q === 'high' ? ' on' : ''), label);
      b.addEventListener('click', () => {
        this.h.app.setQuality(q);
        quality.querySelectorAll('.btn').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
        bloom.style.display = q === 'high' ? '' : 'none';
      });
      quality.appendChild(b);
    };
    mkQ('high', '高');
    mkQ('medium', '中');
    mkQ('low', '低');

    const legend = el('div', 'legend');
    legend.innerHTML = `
      <span><i style="background:#9aa4b2"></i>来料</span>
      <span><i style="background:#4a9eff"></i>在制</span>
      <span><i style="background:#2fd07a"></i>成品</span>
      <span class="hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击设备定位</span>
    `;

    bar.appendChild(play);
    bar.appendChild(speeds);
    bar.appendChild(el('div', 'sep'));
    bar.appendChild(tour);
    bar.appendChild(reset);
    bar.appendChild(el('div', 'sep'));
    bar.appendChild(bloom);
    bar.appendChild(quality);
    bar.appendChild(el('div', 'sep'));
    bar.appendChild(legend);

    this.root.appendChild(bar);
  }

  private bloomOn = true;

  /* ------------------------------ 交互 ------------------------------ */
  private focusStation(st: Station) {
    this.tourOn = false;
    this.h.rig.flyTo(st.focusPos, st.focusTarget, 1.4);
    this.select(st.id);
  }

  private select(id: string) {
    this.rows.forEach((row, key) => row.classList.toggle('active', key === id));
  }

  private applyPreset(i: number) {
    const p = PRESETS[i];
    this.h.rig.flyToPreset(p, 1.8);
    this.select(p.id);
  }

  /** 外部（3D 拾取）调用 */
  selectById(id: string) {
    const st = this.h.factory.stations.find((s) => s.id === id);
    if (st) this.focusStation(st);
  }

  /* ------------------------------ 刷新 ------------------------------ */
  update(dt: number) {
    if (this.tourOn) {
      this.tourTimer += dt;
      if (this.tourTimer > 7) {
        this.tourTimer = 0;
        this.tourIndex = (this.tourIndex + 1) % PRESETS.length;
        this.applyPreset(this.tourIndex);
      }
    }

    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;

    const m = this.h.flow.metrics;
    const st = this.h.factory.stations;

    for (const s of st) {
      const row = this.rows.get(s.id);
      if (!row) continue;
      const chip = row.querySelector('.station-state') as HTMLElement;
      const cls = `station-state s-${s.status}` + (s.status === 'busy' ? ' s-pulse' : '');
      if (chip.className !== cls) chip.className = cls;
      chip.textContent = STATUS_TEXT[s.status];
      const wip = row.querySelector('.wip') as HTMLElement;
      wip.textContent = `${s.wip} 件`;
    }

    this.kpi.prod.innerHTML = `${m.produced}<span class="kpi-unit">垛</span>`;
    this.kpi.wip2.innerHTML = `${m.wip}<span class="kpi-unit">件</span>`;
    this.kpi.cycle.innerHTML = `${m.cycleSec.toFixed(1)}<span class="kpi-unit">s</span>`;
    this.kpi.oee.innerHTML = `${m.oee.toFixed(1)}<span class="kpi-unit">%</span>`;
    this.kpi.qc.innerHTML = `${m.quality.toFixed(1)}<span class="kpi-unit">%</span>`;
    this.kpi.onliner.innerHTML = `96.4<span class="kpi-unit">%</span>`;
    this.kpi.online.textContent = '12/12';
    this.kpi.wip.textContent = String(m.wip);
    this.kpi.agv.textContent = `${m.agvBusy}/${this.h.factory.agvs.length}`;

    const d = new Date();
    this.clockEl.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }

  private drawChart() {
    const c = this.chart;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = c.clientWidth || 230;
    const h = c.clientHeight || 78;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = hourlyOutput;
    const max = Math.max(...data.map((d) => d.plan)) * 1.15;
    const bw = w / data.length;

    data.forEach((d, i) => {
      const bh = (d.output / max) * (h - 16);
      const x = i * bw + 2;
      const y = h - 12 - bh;
      const g = ctx.createLinearGradient(0, y, 0, h - 12);
      g.addColorStop(0, '#ff8a2b');
      g.addColorStop(1, 'rgba(255,138,43,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, bw - 4, bh);
      // 计划线
      const py = h - 12 - (d.plan / max) * (h - 16);
      ctx.strokeStyle = 'rgba(125,165,205,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
      ctx.setLineDash([]);
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(160,175,195,0.75)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.hour, x + (bw - 4) / 2, h - 2);
      }
    });
  }
}
