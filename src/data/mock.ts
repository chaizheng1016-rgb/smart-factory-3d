/** 模拟数据源：用于看板指标与趋势曲线 */

export interface HourPoint {
  hour: string;
  output: number;
  plan: number;
}

function genSeries(seed: number): HourPoint[] {
  const out: HourPoint[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const h = String(d.getHours()).padStart(2, '0');
    const plan = 120;
    const output = Math.round(plan * (0.78 + rnd() * 0.34));
    out.push({ hour: h, output, plan });
  }
  return out;
}

export const hourlyOutput = genSeries(20261112);

export const workOrders = [
  { no: 'WO-20261112-001', product: '精密减速机壳体', qty: 480, done: 312, state: '生产中' },
  { no: 'WO-20261112-002', product: '电机端盖组件', qty: 260, done: 96, state: '生产中' },
  { no: 'WO-20261112-003', product: '轴承座支架', qty: 180, done: 180, state: '已完工' },
];

export const deviceHealth = [
  { id: 'CNC-01', oee: 92.4, state: '运行' },
  { id: 'CNC-02', oee: 88.7, state: '运行' },
  { id: 'ROB-01', oee: 95.1, state: '运行' },
  { id: 'PK-01', oee: 86.3, state: '运行' },
];

export const materialStateText: Record<string, string> = {
  raw: '来料',
  part: '在制',
  carton: '成品',
};
