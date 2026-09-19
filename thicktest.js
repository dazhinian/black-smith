// 厚度效应验证：c(h/2a) 是否真的让「越打越薄越难打」
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
let code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

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
  frame:(t)=>frame(t), buildAll, doStrike,
  get N(){return N}, get pos(){return pos}, get T(){return T},
  get eBrk(){return eBrk}, get totalV0(){return totalV0},
  get tv(){return tv}, get tskip(){return tskip}, tetVol,
  CFG, get lastPen(){return lastPen}, get hamC(){return hamC},
  get hamH(){return hamH}, get ySurf(){return ySurf},
  get hamFavg(){return hamFavg}, get anvilT(){return anvilT}
};`;
let api;
try { api = new Function(code + exportTail)(); }
catch (e) { console.error('运行错误：', e); process.exit(1); }

let _t = Date.now();
function run(frames) { for (let i = 0; i < frames; i++) { _t += 16.7; api.frame(_t); } }
const fx = (x, n) => (isFinite(x) ? x.toFixed(n) : 'NaN');
function hgt() {
  const p = api.pos; let a = 1e9, b = -1e9;
  for (let i = 0; i < api.N; i++) { const y = p[i * 3 + 1]; if (y < a) a = y; if (y > b) b = y; }
  return b - a;
}

function scenario(name, cThick) {
  api.buildAll();
  api.CFG.coolScale = 0; api.CFG.anvilCool = 0;   // 关掉冷却，隔离变量
  api.CFG.cThick = cThick;
  console.log(`\n── ${name} ──`);
  console.log('   锤#  锤下厚mm  h/2a   透入mm   约束因子c   锤力kN');
  for (let k = 0; k < 14; k++) {
    api.doStrike();
    run(20);
    /* 锤下真实料厚（打击瞬间采样，全局 bbox 会被足迹外隆起污染） */
    const hLoc = api.hamH;
    const r = hLoc / Math.min(api.CFG.hW, api.CFG.hD);
    console.log(`   ${String(k + 1).padStart(2)}   ${fx(hLoc, 2).padStart(6)}  ${fx(r, 3)}   ` +
      `${fx(api.lastPen, 3).padStart(6)}   ${fx(api.hamC, 2).padStart(7)}   ` +
      `${fx(api.hamFavg / 1000, 0).padStart(6)}`);
  }
}

console.log('厚度效应：1150°C 恒温（关冷却），原地连打 14 锤');
scenario('c 恒为 3（旧行为）', 0);
scenario('c = c(h/2a)（新）', 1);

/* 摩擦 hill：砧面摩擦是否真的进入锤力（以前只影响形状，不影响力） */
function fricScan(cFric) {
  console.log(`\n── 摩擦 hill 扫描（单锤，1150°C 恒温）cFric=${cFric} ──`);
  console.log('   砧面摩擦μ   透入mm   约束因子c   锤力kN   Z展宽mm');
  for (const mu of [0, 0.3, 0.55, 0.9]) {
    api.buildAll();
    api.CFG.coolScale = 0; api.CFG.anvilCool = 0;
    api.CFG.fricAnvil = mu; api.CFG.cFric = cFric;
    api.doStrike(); run(30);
    let za = 1e9, zb = -1e9;
    for (let i = 0; i < api.N; i++) { const z = api.pos[i * 3 + 2]; if (z < za) za = z; if (z > zb) zb = z; }
    console.log(`   ${fx(mu, 2).padStart(8)}   ${fx(api.lastPen, 3).padStart(6)}   ` +
      `${fx(api.hamC, 2).padStart(7)}   ${fx(api.hamFavg / 1000, 0).padStart(6)}   ` +
      `${fx((zb - za) - api.CFG.Lz, 2).padStart(7)}`);
  }
}
fricScan(0);
fricScan(1);
