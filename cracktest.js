// 断裂面 A/B 测试：测「渲染表面围出的体积」，而不只是物理体积。
// 用户看到的是渲染出来的那层壳，物理体积守恒但壳缩了，视觉上照样变小。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

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
  return {
    style: {}, textContent: '', innerHTML: '', value: 0, checked: false,
    className: '', type: '', min: 0, max: 0, step: 0,
    width: 800, height: 600, clientWidth: 800, clientHeight: 600,
    appendChild() {}, append() {}, addEventListener() {},
    getContext: () => glFake,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelectorAll: () => []
  };
}
global.document = { getElementById: () => el(), createElement: () => el(), querySelectorAll: () => [] };
global.window = { addEventListener() {}, devicePixelRatio: 1 };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.devicePixelRatio = 1;
global.location = { search: '', hash: '' };

const exportTail = `
return {
  frame:(t)=>frame(t), buildAll, doStrike, stepThermal, updateRender, updateCellDead,
  get N(){return N}, get M(){return M}, get NT(){return NT}, get NC(){return NC},
  get pos(){return pos}, get T(){return T}, get eBrk(){return eBrk}, get tv(){return tv},
  get totalV0(){return totalV0}, get triBuf(){return triBuf}, get triN(){return triN},
  get crvP(){return crvP}, get crvN(){return crvN}, get crvQ(){return crvQ},
  get faceN(){return faceN}, get cellDead(){return cellDead}, get cellGone(){return cellGone},
  get MAXCQ(){return MAXCQ}, tetVol, CFG
};`;
const api = new Function(code + exportTail)();

let t0 = 0;
function run(n) { for (let i = 0; i < n; i++) api.frame((t0 += 16.7)); }

/* 渲染表面围出的体积（散度定理）。表面封闭时 = 真实外体积；
   内部裂纹面两侧各一层、法线相反，正好互相抵消，不污染结果。
   表面有洞时结果会明显偏小 —— 正好用来量化「视觉上缩了多少」。       */
function renderVolume() {
  const { triBuf, triN, N, pos, crvP } = api;
  const P = j => (j < N ? [pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]]
                        : [crvP[(j - N) * 3], crvP[(j - N) * 3 + 1], crvP[(j - N) * 3 + 2]]);
  let v = 0;
  for (let i = 0; i < triN; i += 3) {
    const a = P(triBuf[i]), b = P(triBuf[i + 1]), c = P(triBuf[i + 2]);
    const cx = b[1] * c[2] - b[2] * c[1], cy = b[2] * c[0] - b[0] * c[2], cz = b[0] * c[1] - b[1] * c[0];
    v += (a[0] * cx + a[1] * cy + a[2] * cz) / 6;
  }
  return v;
}
function physVolume() {
  let v = 0;
  for (let t = 0; t < api.NT; t++)
    v += api.tetVol(api.tv[4 * t], api.tv[4 * t + 1], api.tv[4 * t + 2], api.tv[4 * t + 3]);
  return v;
}
/* 看得见的材料体积：只对「会被渲染的胞」求四面体和。
   这个指标不受表面三角化影响，纯粹回答「有多少料被画出来了」。          */
function shownVolume() {
  let v = 0;
  for (let c = 0; c < api.NC; c++) {
    if (api.cellGone[c]) continue;
    if (api.cellDead[c] && !api.CFG.spallShow) continue;
    for (let q = 0; q < 5; q++) {
      const t = c * 5 + q;
      v += api.tetVol(api.tv[4 * t], api.tv[4 * t + 1], api.tv[4 * t + 2], api.tv[4 * t + 3]);
    }
  }
  return v;
}
const count = arr => { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i]) n++; return n; };

/* 流形性检查：封闭且定向一致的三角网格里，每条有向边 (u→v) 恰好出现一次。
   某条无向边只出现 1 次 = 边界边 = 网格上有洞；出现 ≥3 次 = 非流形。
   洞就是渲染体积比物理体积少的那部分。                                  */
function holeReport() {
  const { triBuf, triN, N } = api;
  const key = (u, v) => (u < v ? u + ':' + v : v + ':' + u);
  const dir = new Map();   // 有向边 → 次数
  for (let i = 0; i < triN; i += 3) {
    const t = [triBuf[i], triBuf[i + 1], triBuf[i + 2]];
    for (let k = 0; k < 3; k++) {
      const d = t[k] + '>' + t[(k + 1) % 3];
      dir.set(d, (dir.get(d) || 0) + 1);
    }
  }
  let boundary = 0, nonmani = 0, dup = 0;
  const und = new Map();
  for (const [d, n] of dir) {
    const [u, v] = d.split('>').map(Number);
    const k = key(u, v);
    und.set(k, (und.get(k) || 0) + n);
    if (n > 1) dup++;
  }
  for (const [, n] of und) { if (n === 1) boundary++; else if (n > 2) nonmani++; }
  return { boundary, nonmani, dup, edges: und.size };
}

/* 场景：加热 → 淬火（冷脆）→ 锤击。这正是用户描述的「淬火后直接锤击会破损」。 */
function scenario(label, opts) {
  api.CFG.crackFace = opts.crackFace;
  api.CFG.spallShow = opts.spallShow;
  api.CFG.spallDrop = opts.spallDrop;
  api.CFG.nx = 20; api.CFG.ny = 6; api.CFG.nz = 7;
  api.buildAll();
  const v0 = api.totalV0;
  run(3);
  const rv0 = renderVolume();          /* 先跑几帧，渲染缓冲才有内容 */
  run(10);
  api.CFG.coolScale = 30; run(200);          // 淬火：1150 → 室温
  api.CFG.coolScale = 1;
  const rvQ = renderVolume();
  api.CFG.depth = 8;
  const marks = [];
  for (let k = 0; k < 20; k++) {
    api.doStrike(); run(30);
    marks.push((shownVolume() / v0 - 1) * 100);
  }
  const rvEnd = renderVolume(), pvEnd = physVolume(), svEnd = shownVolume();
  const h = holeReport();
  console.log(
    label.padEnd(28) +
    ' 可见料 ' + ((svEnd / v0 - 1) * 100).toFixed(2).padStart(7) + '%' +
    '  物理 ' + ((pvEnd / v0 - 1) * 100).toFixed(2).padStart(7) + '%' +
    '  壳/料 ' + ((rvEnd / svEnd - 1) * 100).toFixed(1).padStart(5) + '%' +
    '  边界边 ' + String(h.boundary).padStart(4) +
    '  每5锤 ' + marks.filter((_, i) => i % 5 === 4).map(x => x.toFixed(1)).join(' ') +
    '  断边 ' + count(api.eBrk) + ' 死胞 ' + count(api.cellDead) + '/' + api.NC +
    '  裂纹面 ' + api.crvQ);
}

console.log('构建 OK  点=' + api.N + ' 边=' + api.M + ' 胞=' + api.NC + '\n');
console.log('场景：加热 1150°C → 淬火到室温 → 冷脆状态下锤击 12 次\n');
console.log('（渲染体积 = 看得见的那层壳围出的体积；物理体积 = 四面体求和）\n');

scenario('旧行为 删面(胞死即不画)', { crackFace: 0, spallShow: 0, spallDrop: 13 });
scenario('新行为 两侧平贴面', { crackFace: 1, spallShow: 1, spallDrop: 13 });
scenario('新行为 + 10/12 断裂即脱落', { crackFace: 1, spallShow: 1, spallDrop: 10 });
scenario('只开平贴面(碎料不画)', { crackFace: 1, spallShow: 0, spallDrop: 13 });

console.log('\n--- 裂纹判据 crackK 灵敏度（平贴面 + 碎料保留）---');
for (const k of [1, 2, 3, 4]) {
  api.CFG.crackK = k;
  scenario('crackK=' + k, { crackFace: 1, spallShow: 1, spallDrop: 13 });
}
console.log('\n顶点池 MAXCQ=' + api.MAXCQ + '（裂纹面数超过就退化为共享顶点）');
