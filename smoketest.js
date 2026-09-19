// 无头冒烟测试：桩掉 DOM/WebGL，只跑物理内核
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script'); process.exit(1); }
let code = m[1];

/* ---------- DOM / WebGL 桩 ---------- */
const glFake = new Proxy({}, {
  get(t, p) {
    if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
    if (p === 'getAttribLocation') return () => 0;
    if (p === 'getUniformLocation') return () => ({});
    if (p === 'createShader' || p === 'createProgram' || p === 'createBuffer') return () => ({});
    if (p === 'getShaderInfoLog' || p === 'getProgramInfoLog') return () => '';
    return () => {};
  }
});
function el() {
  const o = {
    style: {}, textContent: '', innerHTML: '', value: 0, checked: false,
    className: '', type: '', min: 0, max: 0, step: 0,
    width: 800, height: 600, clientWidth: 800, clientHeight: 600,
    appendChild() {}, append() {}, addEventListener() {},
    getContext: () => glFake,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelectorAll: () => []
  };
  return o;
}
global.document = { getElementById: () => el(), createElement: () => el(), querySelectorAll: () => [] };
global.window = { addEventListener() {}, devicePixelRatio: 1 };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.devicePixelRatio = 1;
global.location = { search: '', hash: '' };

const exportTail = `
return {
  frame:(t)=>frame(t), buildAll, doStrike, stepThermal, solveIter, updateRender, updateHammer,
  get N(){return N}, get M(){return M}, get NT(){return NT}, get pos(){return pos}, get T(){return T},
  get eEp(){return eEp}, get eLp(){return eLp}, get eL0(){return eL0},
  get eD(){return eD}, get eBrk(){return eBrk}, get eSig(){return eSig},
  get hammer(){return hammer}, get totalV0(){return totalV0}, get tv(){return tv}, get tskip(){return tskip},
  get Vol(){return Vol}, get V0(){return V0}, get hammerCount(){return hammerCount},
  tetVol, CFG, get auto(){return auto}, set auto(v){auto=v}, get settleFrames(){return settleFrames},
  set settleFrames(v){settleFrames=v},
  brkCount, get testRpt(){return testRpt}, get hamBear(){return hamBear}, get lastPen(){return lastPen},
  get eAe(){return eAe}, get eI(){return eI}, get eJ(){return eJ},
  get hamFavg(){return hamFavg}, get xi(){return xi}, set T0(v){CFG.T0=v}
};`;
let api;
try { api = new Function(code + exportTail)(); }
catch (e) { console.error('语法/运行错误：', e); process.exit(1); }
console.log('构建 OK  点=' + api.N + ' 边=' + api.M + ' 体元=' + api.NT);

/* ---------- 工具 ---------- */
function totalVolume(skipBroken) {
  let v = 0;
  for (let t = 0; t < api.NT; t++) {
    if (skipBroken && api.tskip[t]) continue;
    v += api.tetVol(api.tv[4 * t], api.tv[4 * t + 1], api.tv[4 * t + 2], api.tv[4 * t + 3]);
  }
  return v;
}
/* 棘轮比 = 累积塑性路径 / 净塑性应变。理想 ≈ 1.0，越大说明数值抖动被吃成塑性 */
function ratchet() {
  let net = 0, path = 0;
  for (let e = 0; e < api.M; e++) {
    net += Math.abs(api.eLp[e]) / api.eL0[e];
    path += api.eEp[e];
  }
  return { net: net / api.M, path: path / api.M, ratio: net > 1e-9 ? path / net : 1 };
}
function bbox() {
  const p = api.pos; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
  for (let i = 0; i < api.N; i++) for (let d = 0; d < 3; d++) {
    const v = p[i * 3 + d]; if (v < a[d]) a[d] = v; if (v > b[d]) b[d] = v;
  }
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}
function stats() {
  let nan = false, tmax = -1e9, tsum = 0, ep = 0, brk = 0, smax = 0;
  for (let i = 0; i < api.N * 3; i++) if (!isFinite(api.pos[i])) nan = true;
  for (let i = 0; i < api.N; i++) { if (api.T[i] > tmax) tmax = api.T[i]; tsum += api.T[i]; }
  for (let e = 0; e < api.M; e++) {
    if (api.eEp[e] > ep) ep = api.eEp[e];
    if (api.eBrk[e]) brk++;
    if (Math.abs(api.eSig[e]) > smax) smax = Math.abs(api.eSig[e]);
  }
  return { nan, tmax, tavg: tsum / api.N, ep, brk, smax };
}
let t = Date.now();
let _n=0,_t0=0;
function run(frames) { const a=Date.now(); for (let i = 0; i < frames; i++) { t += 16.7; api.frame(t); _n++; } _t0+=Date.now()-a; }
function ms(){const v=_n?(_t0/_n).toFixed(2):'-';_n=0;_t0=0;return v;}

/* ---------- 1. 静置稳定性 ---------- */
api.CFG.coolScale = 0;
run(60);
let s = stats(), v = totalVolume(), bb = bbox();
console.log('\n[1] 静置 60 帧   '+ms()+' ms/帧');
console.log('   体积偏差 ' + ((v / api.totalV0 - 1) * 100).toFixed(3) + '%  外形 ' +
  bb.map(x => x.toFixed(2)).join(' × ') + '  NaN=' + s.nan + '  εpmax=' + s.ep.toFixed(4));

/* ---------- 2. 单次锤击 ---------- */
api.doStrike();
run(90);
v = totalVolume(false); bb = bbox(); s = stats();
console.log('\n[2] 单次锤击   '+ms()+' ms/帧');
console.log('   体积偏差 ' + ((v / api.totalV0 - 1) * 100).toFixed(3) + '%  外形 ' +
  bb.map(x => x.toFixed(2)).join(' × ') + '  εpmax=' + s.ep.toFixed(3) + '  σmax=' + s.smax.toFixed(1) + 'MPa');

/* ---------- 3. 连击 40 次（镦粗同一位置） ---------- */
const n0 = api.hammerCount;
for (let k = 0; k < 40; k++) { api.doStrike(); run(28); }
v = totalVolume(false); bb = bbox(); s = stats();
console.log('\n[3] 连击 40 次   '+ms()+' ms/帧');
console.log('   体积偏差 ' + ((v / api.totalV0 - 1) * 100).toFixed(3) + '%  外形 ' +
  bb.map(x => x.toFixed(2)).join(' × ') + '  εpmax=' + s.ep.toFixed(3) +
  '  断边=' + s.brk + '  NaN=' + s.nan);
console.log('   温度 峰' + s.tmax.toFixed(0) + ' 均' + s.tavg.toFixed(0) + '°C');
{const r=ratchet();console.log('   棘轮 净εp=' + r.net.toFixed(3) + ' 路径=' + r.path.toFixed(3) + ' 比=' + r.ratio.toFixed(2));}

/* ---------- 4. 冷打（应开裂） ---------- */
api.buildAll(); api.CFG.coolScale = 0; api.CFG.T0 = 20;
api.buildAll();
for (let k = 0; k < 30; k++) { api.doStrike(); run(28); }
s = stats();
console.log('\n[4] 冷打 30 次（20°C）   '+ms()+' ms/帧');
console.log('   断边=' + s.brk + '/' + api.M + '  εpmax=' + s.ep.toFixed(3) + '  NaN=' + s.nan);

/* ---------- 5. 淬火 ---------- */
api.buildAll(); api.CFG.coolScale = 1;
run(30);
const tBefore = api.T[0];
api.CFG.coolScale = 30;
run(180);
let xiMax = 0;
s = stats();
console.log('\n[5] 淬火   '+ms()+' ms/帧');
console.log('   温度 ' + tBefore.toFixed(0) + '°C → ' + s.tavg.toFixed(0) + '°C  断边=' + s.brk + '  NaN=' + s.nan);

/* ---------- 6. 高分辨率 + 大动能压力测试（锤: 60kg×8m/s = 1.9kJ/锤） ---------- */
api.buildAll(); api.CFG.coolScale = 0; api.CFG.depth = 8; api.CFG.hMass = 60; api.CFG.hSpeed = 8;
api.CFG.nx = 34; api.CFG.ny = 9; api.CFG.nz = 10;
api.buildAll();
for (let k = 0; k < 25; k++) { api.doStrike(); run(30); }
s = stats(); v = totalVolume(false);
console.log('\n[6] 超高分辨率 34×9×10 + 60kg×8m/s × 25 次   '+ms()+' ms/帧');
console.log('   体积偏差 ' + ((v / api.totalV0 - 1) * 100).toFixed(3) + '%  断边=' + s.brk +
  '  NaN=' + s.nan + '  εpmax=' + s.ep.toFixed(2));
console.log('\n完成。');
