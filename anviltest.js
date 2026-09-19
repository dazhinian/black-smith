// 砧面导热对照实验：开 / 关 anvilCool，看温度场与变形是否真的被拉歪
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
  get N(){return N}, get M(){return M}, get pos(){return pos}, get T(){return T},
  get eEp(){return eEp}, get eBrk(){return eBrk}, get eSig(){return eSig},
  get totalV0(){return totalV0}, get tv(){return tv}, get tskip(){return tskip},
  tetVol, CFG, get anvilT(){return anvilT}, set anvilT(v){anvilT=v},
  get auto(){return auto}, set auto(v){auto=v},
  get settleFrames(){return settleFrames}, set settleFrames(v){settleFrames=v}
};`;
let api;
try { api = new Function(code + exportTail)(); }
catch (e) { console.error('运行错误：', e); process.exit(1); }

let _t = Date.now();
function run(frames) { for (let i = 0; i < frames; i++) { _t += 16.7; api.frame(_t); } }
const fx = (x, n) => (isFinite(x) ? x.toFixed(n) : 'NaN');

function bbox() {
  const p = api.pos; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
  for (let i = 0; i < api.N; i++) for (let d = 0; d < 3; d++) {
    const v = p[i * 3 + d]; if (v < a[d]) a[d] = v; if (v > b[d]) b[d] = v;
  }
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}
function vol() {
  let v = 0;
  for (let t = 0; t < api.tv.length / 4; t++)
    if (!api.tskip[t]) v += api.tetVol(api.tv[4 * t], api.tv[4 * t + 1], api.tv[4 * t + 2], api.tv[4 * t + 3]);
  return v;
}
/* 底面(下 25% 高度) / 顶面(上 25%) 均温 */
function layers() {
  const p = api.pos, T = api.T;
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < api.N; i++) { const y = p[i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const h = Math.max(ymax - ymin, 1e-6);
  let tb = 0, nb = 0, tt = 0, nt = 0, tc = 0, nc = 0;
  for (let i = 0; i < api.N; i++) {
    const y = p[i * 3 + 1];
    if (y < ymin + h * 0.25) { tb += T[i]; nb++; }
    else if (y > ymax - h * 0.25) { tt += T[i]; nt++; }
    if (y >= ymin + h * 0.375 && y <= ymax - h * 0.375) { tc += T[i]; nc++; }
  }
  return { bot: nb ? tb / nb : 0, top: nt ? tt / nt : 0, mid: nc ? tc / nc : 0 };
}
function brk() { let b = 0; for (let e = 0; e < api.M; e++) if (api.eBrk[e]) b++; return b; }

function scenario(name, cool) {
  api.buildAll();
  api.CFG.anvilCool = cool;
  api.CFG.coolScale = 0.8;
  let nTouch = 0, ymin = 1e9;
  for (let i = 0; i < api.N; i++) { const y = api.pos[i * 3 + 1]; if (y < ymin) ymin = y; if (y <= 0.15) nTouch++; }
  console.log(`   [诊断] 贴砧点 ${nTouch}/${api.N}  ymin=${fx(ymin, 3)}  anvilCool=${api.CFG.anvilCool}`);
  const L0 = layers();
  run(180);                       // 约 3 秒静置，冷却
  const L1 = layers();
  console.log(`\n── ${name} ──`);
  console.log(`   静置 3s：底面 ${fx(L1.bot, 0)}°C  芯部 ${fx(L1.mid, 0)}°C  顶面 ${fx(L1.top, 0)}°C` +
    `   （底-顶差 ${fx(L1.bot - L1.top, 0)} K）  砧 ${fx(api.anvilT, 0)}°C`);
  for (let k = 0; k < 20; k++) { api.doStrike(); run(18); }
  const L2 = layers(), bb = bbox(), v = vol();
  console.log(`   连击 20：底面 ${fx(L2.bot, 0)}°C  芯部 ${fx(L2.mid, 0)}°C  顶面 ${fx(L2.top, 0)}°C` +
    `   （底-顶差 ${fx(L2.bot - L2.top, 0)} K）  砧 ${fx(api.anvilT, 0)}°C`);
  console.log(`   外形 ${bb.map(x => fx(x, 2)).join(' × ')} mm   体积偏差 ${fx((v / api.totalV0 - 1) * 100, 3)}%   断边 ${brk()}`);
}

console.log('砧面导热对照（初始 1150°C，静置 3s 后原地连击 20 次）');
scenario('砧面导热 OFF（旧行为）', 0);
scenario('砧面导热 ON（新）', 1);

/* 翻面实验：打完 10 锤后强制翻面（上下颠倒），看冷层是否翻上来 */
api.buildAll(); api.CFG.anvilCool = 1;
for (let k = 0; k < 10; k++) { api.doStrike(); run(18); }
const A = layers();
console.log(`\n── 翻面实验 ──`);
console.log(`   翻面前：底面 ${fx(A.bot, 0)}°C  顶面 ${fx(A.top, 0)}°C  差 ${fx(A.bot - A.top, 0)} K`);
const p = api.pos;
let ymin = 1e9, ymax = -1e9;
for (let i = 0; i < api.N; i++) { const y = p[i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
for (let i = 0; i < api.N; i++) p[i * 3 + 1] = ymin + ymax - p[i * 3 + 1];
run(6);
const B = layers();
console.log(`   翻面后：底面 ${fx(B.bot, 0)}°C  顶面 ${fx(B.top, 0)}°C  差 ${fx(B.bot - B.top, 0)} K`);
run(180);
const C = layers();
console.log(`   再静置 3s：底面 ${fx(C.bot, 0)}°C  顶面 ${fx(C.top, 0)}°C  差 ${fx(C.bot - C.top, 0)} K  砧 ${fx(api.anvilT, 0)}°C`);
