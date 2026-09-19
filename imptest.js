/* 冲击测试对照实验：同一个锻件，「锻合良好」vs「内部有分层 / 未融合」的抗冲击表现。
   验证 bear（承载系数）这条通道是否真能把瑕疵反映到抗冲击读数上。
   锻造锤击和测试打击走同一套动力学，唯一变量是材料自己的连接状态。    */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

const glFake = new Proxy({}, { get(t, p) {
  if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
  if (p === 'getAttribLocation') return () => 0;
  if (p === 'getUniformLocation') return () => ({});
  if (p === 'createShader' || p === 'createProgram' || p === 'createBuffer') return () => ({});
  if (p === 'getShaderInfoLog' || p === 'getProgramInfoLog') return () => '';
  return () => {};
} });
function el() { return { style: {}, textContent: '', innerHTML: '', value: 0, checked: false,
  className: '', type: '', min: 0, max: 0, step: 0, width: 800, height: 600,
  clientWidth: 800, clientHeight: 600, appendChild() {}, append() {}, addEventListener() {},
  getContext: () => glFake, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  querySelectorAll: () => [] }; }
global.document = { getElementById: () => el(), createElement: () => el(), querySelectorAll: () => [] };
global.window = { addEventListener() {}, devicePixelRatio: 1 };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.devicePixelRatio = 1;
global.location = { search: '', hash: '' };

const exportTail = `
return { frame:(t)=>frame(t), buildAll, doStrike, brkCount,
  get N(){return N}, get M(){return M}, get pos(){return pos}, get prevx(){return prevx},
  get vel(){return vel}, get T(){return T}, get xi(){return xi}, get aus(){return aus},
  get eLp(){return eLp}, get eAl(){return eAl}, get eD(){return eD}, get eEp(){return eEp},
  get eBrk(){return eBrk}, get eSig(){return eSig}, get eI(){return eI}, get eJ(){return eJ},
  get eAe(){return eAe}, get pComp(){return pComp}, get pCompPrev(){return pCompPrev},
  get eWeld(){return eWeld}, get pEp(){return pEp},
  get hammer(){return hammer}, get testRpt(){return testRpt}, get hamBear(){return hamBear},
  get lastPen(){return lastPen}, get totalV0(){return totalV0}, get hamN(){return hamN},
  get settleFrames(){return settleFrames}, set settleFrames(v){settleFrames=v}, CFG };`;
const api = new Function(code + exportTail)();

let t = Date.now();
function run(n) { for (let i = 0; i < n; i++) { t += 16.7; api.frame(t); } }
const fx = (x, n) => x.toFixed(n === undefined ? 2 : n);

function snap() {
  const g = k => Float64Array.from(api[k]);
  return { pos: g('pos'), prevx: g('prevx'), vel: g('vel'), T: g('T'), xi: g('xi'), aus: g('aus'),
    eLp: g('eLp'), eAl: g('eAl'), eD: g('eD'), eEp: g('eEp'), eSig: g('eSig'),
    pComp: g('pComp'), pCompPrev: g('pCompPrev'), pEp: g('pEp'),
    eBrk: Uint8Array.from(api.eBrk), eWeld: Uint8Array.from(api.eWeld) };
}
function restore(s) {
  api.pos.set(s.pos); api.prevx.set(s.prevx); api.vel.set(s.vel);
  api.T.set(s.T); api.xi.set(s.xi); api.aus.set(s.aus);
  api.eLp.set(s.eLp); api.eAl.set(s.eAl); api.eD.set(s.eD); api.eEp.set(s.eEp);
  api.eSig.set(s.eSig); api.pComp.set(s.pComp); api.pCompPrev.set(s.pCompPrev);
  api.pEp.set(s.pEp); api.eBrk.set(s.eBrk); api.eWeld.set(s.eWeld);
}
const layerOf = p => Math.floor(p / api.CFG.nx) % api.CFG.ny;

/* 切断跨越 j 界面的边。frac = 沿 X 方向断开的比例（1.0 = 整条界面） */
function makeDelam(jSplit, frac) {
  const nx = api.CFG.nx;
  const x0 = nx * (0.5 - frac / 2), x1 = nx * (0.5 + frac / 2);
  let n = 0;
  for (let e = 0; e < api.M; e++) {
    const a = api.eI[e], b = api.eJ[e];
    const ja = layerOf(a), jb = layerOf(b);
    if ((ja < jSplit && jb >= jSplit) || (jb < jSplit && ja >= jSplit)) {
      const ia = a % nx, ib = b % nx;
      if ((ia + ib) / 2 < x0 || (ia + ib) / 2 > x1) continue;
      api.eBrk[e] = 1; n++;
    }
  }
  return n;
}
function bearAll() {
  let L = 0, F = 0;
  for (let e = 0; e < api.M; e++) { const ae = api.eAe[e]; F += ae; L += ae * (api.eBrk[e] ? api.CFG.contactK : 1); }
  return F > 0 ? L / F : 1;
}
function tavg() { let s = 0; for (let i = 0; i < api.N; i++) s += api.T[i]; return s / api.N; }

/* 标准冲击测试：给定质量与速度，打一锤，读报告 */
function impactTest(mass, spd) {
  const m0 = api.CFG.hMass, v0 = api.CFG.hSpeed, d0 = api.CFG.depth;
  api.CFG.hMass = mass; api.CFG.hSpeed = spd; api.CFG.depth = 8;
  api.doStrike('test');
  let minBear = 1, samples = 0, sumBear = 0;
  for (let i = 0; i < 150; i++) {
    t += 16.7; api.frame(t);
    if (api.hamN > 0) { samples++; sumBear += api.hamBear; if (api.hamBear < minBear) minBear = api.hamBear; }
  }
  if (samples) console.log('      [诊断] 接触采样 ' + samples + ' 次  bear 均 ' +
    fx(sumBear / samples, 3) + ' 最小 ' + fx(minBear, 3) + '  报告值 ' + fx(api.testRpt.bear, 3));
  const r = api.testRpt;
  api.CFG.hMass = m0; api.CFG.hSpeed = v0; api.CFG.depth = d0;
  return r;
}
function row(tag, s, base) {
  const d = base ? '  (透入 ×' + fx(s.pen / base.pen, 2) + ')' : '';
  console.log('   ' + tag.padEnd(20) + '锤下承载 ' + fx(s.bear * 100, 1).padStart(5) + '%' +
    '   透入 ' + fx(s.pen).padStart(5) + 'mm' +
    '   新增断边 ' + String(s.brk).padStart(4) +
    '   吸能 ' + fx(s.E / 1000, 0).padStart(5) + 'J' + d);
}

/* ================= 准备：热锻 6 锤 ================= */
api.CFG.T0 = 1150; api.CFG.coolScale = 0; api.CFG.furnaceOn = false;
api.buildAll();
for (let k = 0; k < 6; k++) { api.doStrike(); run(30); }
run(30);
const S = snap();
console.log('准备：热锻 6 锤，断边 ' + api.brkCount() + '/' + api.M +
  '，均温 ' + fx(tavg(), 0) + '°C，整体承载 ' + fx(bearAll() * 100, 2) + '%\n');

const VARIANTS = [
  ['完好（锻合良好）', () => 0],
  ['单层分层 40%', () => makeDelam(3, 0.4)],
  ['单层界面全断', () => makeDelam(3, 1.0)],
  ['多层未融合(2,3,4)', () => makeDelam(2, 1.0) + makeDelam(3, 1.0) + makeDelam(4, 1.0)],
];

/* ══ 能量扫描：冷态下，大力能不能「强行敲出形变」？══ */
{
  restore(S);
  api.CFG.coolScale = 6;
  for (let n = 0; n < 600; n++) { if (tavg() <= 50) break; run(10); }
  api.CFG.coolScale = 0; run(40);
  const Sc = snap();
  console.log('══ 冷态能量扫描：' + fx(tavg(), 0) + '°C，同一块料，能量逐级加倍 ══');
  console.log('   ' + '锤'.padEnd(16) + '完好件: 透入 / 新增断边    未融合件: 透入 / 新增断边 / 承载');
  for (const [mass, spd] of [[5, 4.5], [10, 6.3], [20, 8.9], [40, 12.6], [80, 12.6]]) {
    restore(Sc); run(20);
    const a = impactTest(mass, spd);
    restore(Sc); makeDelam(2, 1.0); makeDelam(3, 1.0); makeDelam(4, 1.0); run(20);
    const b = impactTest(mass, spd);
    console.log('   ' + (mass + 'kg×' + spd + 'm/s=' + fx(0.5 * mass * spd * spd, 0) + 'J').padEnd(16) +
      fx(a.pen).padStart(6) + 'mm / ' + String(a.brk).padStart(4) + '           ' +
      fx(b.pen).padStart(6) + 'mm / ' + String(b.brk).padStart(4) + ' / ' + fx(b.bear * 100, 0) + '%');
  }
  console.log('');
}

if (process.argv.includes('--e-only')) process.exit(0);
for (const [T, mass, spd] of [['锻态 1150°C', 22, 5], ['中温 ~700°C', 22, 5], ['室温', 30, 8]]) {
  console.log('══ 冲击测试：' + T + '   锤 ' + mass + 'kg × ' + spd + 'm/s = ' +
    fx(0.5 * mass * spd * spd, 0) + 'J ══');
  /* 冷却到目标温度 */
  restore(S);
  if (T !== '锻态 1150°C') {
    api.CFG.coolScale = 4;
    const target = T === '室温' ? 60 : 700;
    for (let n = 0; n < 400; n++) { if (tavg() <= target) break; run(10); }
    api.CFG.coolScale = 0; run(30);
  }
  const Sc = snap();
  let base = null;
  for (const [name, mk] of VARIANTS) {
    restore(Sc);
    const nd = mk();
    if (nd) run(20); else run(20);
    const r = impactTest(mass, spd);
    if (!base) base = r;
    row(name + (nd ? '(' + nd + '边)' : ''), r, base);
  }
  console.log('   测试时均温 ' + fx(tavg(), 0) + '°C\n');
}
