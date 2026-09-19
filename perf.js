// 分辨率 × 性能 探针：不同网格精细度下的帧耗时与体积守恒
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
}});
function el() { return { style:{}, textContent:'', innerHTML:'', value:0, checked:false,
  className:'', type:'', min:0, max:0, step:0, width:800, height:600,
  clientWidth:800, clientHeight:600, appendChild(){}, append(){}, addEventListener(){},
  getContext:()=>glFake, getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
  querySelectorAll:()=>[] }; }
global.document = { getElementById:()=>el(), createElement:()=>el(), querySelectorAll:()=>[] };
global.window = { addEventListener(){}, devicePixelRatio:1 };
global.performance = { now:()=>Date.now() };
global.requestAnimationFrame = () => 0;
global.devicePixelRatio = 1;
global.location = { search:'', hash:'' };

const tail = `
return { frame:(t)=>frame(t), buildAll, doStrike, tetVol,
  get N(){return N}, get M(){return M}, get NC(){return NC}, get NT(){return NT},
  get tv(){return tv}, get tskip(){return tskip}, get totalV0(){return totalV0},
  get faceN(){return faceN}, get eBrk(){return eBrk}, CFG };`;
const api = new Function(code + tail)();

function totalVolume(skipBroken) {
  let v = 0;
  for (let t = 0; t < api.NT; t++) {
    if (skipBroken && api.tskip[t]) continue;
    v += api.tetVol(api.tv[4*t], api.tv[4*t+1], api.tv[4*t+2], api.tv[4*t+3]);
  }
  return v;
}

let t = Date.now(), _n = 0, _t0 = 0;
function run(frames) { const a = Date.now();
  for (let i = 0; i < frames; i++) { t += 16.7; api.frame(t); _n++; }
  _t0 += Date.now() - a; }
function ms() { const v = _n ? (_t0 / _n) : 0; _n = 0; _t0 = 0; return v; }

const presets = [
  ['低   12x4x5',   12, 4, 5],
  ['中   18x5x6',   18, 5, 6],   // 当前默认
  ['高   26x7x8',   26, 7, 8],
  ['超高 34x9x10',  34, 9, 10],
  ['极致 42x11x12', 42, 11, 12],
];

console.log('预设            点    边     胞   静置ms  锤击ms  体积偏差   可见面');
console.log('-'.repeat(72));

for (const [label, nx, ny, nz] of presets) {
  api.CFG.nx = nx; api.CFG.ny = ny; api.CFG.nz = nz;
  api.buildAll();
  api.CFG.coolScale = 0;

  run(30);                       // 静置
  const idle = ms();

  api.doStrike(); run(60);       // 锤击阶段
  const strike = ms();

  const dev = (totalVolume(false) / api.totalV0 - 1) * 100;
  let brk = 0; for (let e = 0; e < api.M; e++) if (api.eBrk[e]) brk++;

  console.log(
    label.padEnd(15) +
    String(api.N).padStart(5) + String(api.M).padStart(7) + String(api.NC).padStart(6) +
    idle.toFixed(2).padStart(8) + strike.toFixed(2).padStart(8) +
    (dev.toFixed(2) + '%').padStart(10) + String(api.faceN).padStart(8)
  );
}
console.log('\n注：锤击ms 为锤下压+回弹期间的平均帧耗时（含塑性迭代与体积投影）');
