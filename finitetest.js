// 有限砧面：打在砧边悬出端，材料是否真的能被压弯（以前砧面无限大，压不弯）
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
  get eBrk(){return eBrk}, get totalV0(){return totalV0}, get M(){return M},
  get tv(){return tv}, get tskip(){return tskip}, tetVol,
  CFG, get hammer(){return hammer}, get lastPen(){return lastPen}, get hamC(){return hamC}
};`;
let api;
try { api = new Function(code + exportTail)(); }
catch (e) { console.error('运行错误：', e); process.exit(1); }

let _t = Date.now();
function run(n) { for (let i = 0; i < n; i++) { _t += 16.7; api.frame(_t); } }
const fx = (x, n) => (isFinite(x) ? x.toFixed(n) : 'NaN');

/* 锤头落点 x 处，半径 8mm 内的最低点高度 —— 看悬出端有没有被压下去 */
function lowAt(hx) {
  const p = api.pos; let lo = 1e9;
  for (let i = 0; i < api.N; i++) {
    if (Math.abs(p[i * 3] - hx) > 8) continue;
    if (p[i * 3 + 1] < lo) lo = p[i * 3 + 1];
  }
  return lo;
}
function brk() { let b = 0; for (let e = 0; e < api.M; e++) if (api.eBrk[e]) b++; return b; }

function hit(name, finite, hx) {
  api.buildAll();
  api.CFG.coolScale = 0; api.CFG.anvilCool = 0;
  api.CFG.anvilFinite = finite ? 1 : 0;
  api.CFG.anvilW = 80; api.CFG.anvilD = 200;   // X 方向料 120mm 两端各悬出 20mm
  api.hammer.hx = hx; api.hammer.hz = 0;
  const before = lowAt(hx);
  for (let k = 0; k < 4; k++) { api.doStrike(); run(22); }
  const after = lowAt(hx);
  console.log(`   ${name.padEnd(22)} 落点x=${String(hx).padStart(3)}  ` +
    `压前 ${fx(before, 2).padStart(6)} → 压后 ${fx(after, 2).padStart(6)} mm  ` +
    `下沉 ${fx(before - after, 2).padStart(6)} mm   断边 ${brk()}`);
}

console.log('有限砧面：砧面 X 方向 80mm，料 120mm → 两端各悬出 20mm');
console.log('（料底面初始在 y≈2=半格偏移处，砧面支撑区 y=0）');
hit('无限砧面 · 打中间', 0, 0);
hit('无限砧面 · 打悬出端', 0, 50);
hit('有限砧面 · 打中间', 1, 0);
hit('有限砧面 · 打悬出端', 1, 50);
