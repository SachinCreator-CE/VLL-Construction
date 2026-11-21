(function () {
'use strict';
/* ---------- helpers ---------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const easeOutBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- story stages (T runs 0..1 across the scroll story) ---------- */
const STAGES = [
  { id: 'S-01', name: 'Site survey',    a: 0.00, b: 0.06 },
  { id: 'S-02', name: 'Excavation',     a: 0.06, b: 0.24 },
  { id: 'S-03', name: 'Foundation',     a: 0.24, b: 0.38 },
  { id: 'S-04', name: 'Superstructure', a: 0.38, b: 0.72 },
  { id: 'S-05', name: 'Envelope',       a: 0.72, b: 0.85 },
  { id: 'S-06', name: 'Skyline',        a: 0.85, b: 1.00 },
];
const stageP = (T, i) => seg(T, STAGES[i].a, STAGES[i].b);

/* ---------- the model: plan unit = 3 m, storey = 3.5 m ---------- */
const PLOT = 14, LAYERS = 5, PIT = 6, PIT_DEPTH = 3;
const LEVELS = 38;                                   // B2, B1, then floors 0..35
const tierOf = lv => (lv < 24 ? 6 : lv < 32 ? 4 : 2);

// tower modules, placed ring-first in a slow spiral, then the core
const BLOCKS = [], LEVEL_END = [];
for (let lv = 0; lv < LEVELS; lv++) {
  const n = tierOf(lv), h = (n - 1) / 2, cells = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i - h, z = j - h;
    const ring = Math.abs(x) === h || Math.abs(z) === h;
    const core = Math.abs(x) <= 0.5 && Math.abs(z) <= 0.5;
    if (n === 6 && !ring && !core) continue;
    const a = ((Math.atan2(z, x) - lv * 0.55) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    cells.push({ x, z, ring: ring ? 1 : 0, a });
  }
  cells.sort((p, q) => (q.ring - p.ring) || (p.a - q.a));
  for (const c of cells) BLOCKS.push({ x: c.x, y: lv - 1.5, z: c.z, lv, core: !c.ring });
  LEVEL_END[lv] = BLOCKS.length - 1;
}
const NB = BLOCKS.length;                            // 728
const FLIGHT = 7, SLAB_LAG = 4;                       // blocks in flight; slab unfold time (in block-steps)

// the pit: 6 x 6 cells, 3 layers deep, dug layer by layer in a back-and-forth sweep
const DIG = [];
for (let l = 0; l < PIT_DEPTH; l++) {
  for (let i = 0; i < PIT; i++) {
    const x = (PIT - 1) / 2 - i;                       // start at the excavator side (+x)
    for (let j = 0; j < PIT; j++) {
      const z = (i % 2 === 0 ? j : PIT - 1 - j) - (PIT - 1) / 2;
      DIG.push({ x, y: -0.5 - l, z, l });
    }
  }
}
const ND = DIG.length;                               // 108
const DIG_W = 0.1;

/* sub-phases, each 0..1 */
function phases(T) {
  const s1 = stageP(T, 1), s2 = stageP(T, 2), s3 = stageP(T, 3), s4 = stageP(T, 4), s5 = stageP(T, 5);
  return {
    survey: stageP(T, 0),
    dig: seg(s1, 0.08, 0.9), digIn: seg(s1, 0, 0.1), digOut: seg(s1, 0.9, 1),
    piles: seg(s2, 0, 0.32), rebar: seg(s2, 0.3, 0.58), pour: seg(s2, 0.56, 0.94), found: s2,
    craneUp: seg(s3, 0, 0.06), frame: seg(s3, 0.04, 0.98),
    facade: seg(s4, 0, 0.7), craneDown: seg(s4, 0.58, 0.9), spire: seg(s4, 0.72, 1),
    tidy: seg(s5, 0, 0.18), lots: seg(s5, 0.04, 0.42), grow: seg(s5, 0.14, 0.62), sky: s5
  };
}
const buildProgress = p => p.frame * (NB + FLIGHT + SLAB_LAG);
function blocksDone(p) { return clamp(Math.floor(buildProgress(p) - FLIGHT) + 1, 0, NB); }
function topLevelDone(done) { let top = -1; for (let lv = 0; lv < LEVELS; lv++) if (LEVEL_END[lv] < done) top = lv; return top; }

/* readout numbers, all derived from the model */
function readout(T) {
  const p = phases(T);
  let dug = 0;
  for (let k = 0; k < ND; k++) if (p.dig >= k / ND * (1 - DIG_W) + DIG_W) dug++;
  const done = blocksDone(p), top = topLevelDone(done);
  let slabs = 0;
  for (let lv = 0; lv <= top; lv++) slabs += [0, 0, 9, 0, 36, 0, 81][tierOf(lv)];
  const heightUnits = Math.max(0, top - 1) + p.spire * 6;
  return {
    stage: STAGES.reduce((acc, s, i) => (T >= s.a - 1e-6 ? i : acc), 0),
    depth: dug / ND * 10.5,
    concrete: p.pour * 1134 + slabs,
    modules: done,
    height: heightUnits * 3.5
  };
}

/* ---------- time of day and camera, keyed on T ---------- */
const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const SKY = [
  { t: 0.00, top: 0x76a9d8, mid: 0xe4ecef, bot: 0xb9b2a6, el: 30, az: 140, sun: 0xfff0dc, sunI: 1.0, hemi: 0.42, env: 0.5, night: 0 },
  { t: 0.40, top: 0x5b98d4, mid: 0xdbe8ef, bot: 0xb9b2a6, el: 56, az: 170, sun: 0xffffff, sunI: 1.05, hemi: 0.45, env: 0.55, night: 0 },
  { t: 0.72, top: 0x6a8ec4, mid: 0xe6dccb, bot: 0xb3a99b, el: 28, az: 215, sun: 0xffe2bd, sunI: 1.0, hemi: 0.4, env: 0.5, night: 0 },
  { t: 0.86, top: 0x4b5f9b, mid: 0xefb184, bot: 0x8c7a6d, el: 9, az: 238, sun: 0xffb072, sunI: 0.9, hemi: 0.3, env: 0.38, night: 0.08 },
  { t: 0.93, top: 0x1e2752, mid: 0xb7715d, bot: 0x3a3340, el: 3, az: 246, sun: 0xff8c5c, sunI: 0.4, hemi: 0.2, env: 0.22, night: 0.62 },
  { t: 1.00, top: 0x060a17, mid: 0x1c2546, bot: 0x0b0e17, el: 38, az: 250, sun: 0x8ea6d8, sunI: 0.3, hemi: 0.12, env: 0.12, night: 1 }
];
function skyAt(T) {
  let i = 0;
  while (i < SKY.length - 2 && T > SKY[i + 1].t) i++;
  const a = SKY[i], b = SKY[i + 1], u = ease(seg(T, a.t, b.t));
  const mix = (x, y) => { const p = hex(x), q = hex(y); return [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; };
  return {
    top: mix(a.top, b.top), mid: mix(a.mid, b.mid), bot: mix(a.bot, b.bot), sun: mix(a.sun, b.sun),
    el: lerp(a.el, b.el, u), az: lerp(a.az, b.az, u), sunI: lerp(a.sunI, b.sunI, u),
    hemi: lerp(a.hemi, b.hemi, u), env: lerp(a.env, b.env, u), night: lerp(a.night, b.night, u)
  };
}

const CAM = [
  { t: 0.00, ty: 1.5, r: 30, el: 26, az: 34 },
  { t: 0.06, ty: 0.0, r: 26, el: 34, az: 44 },
  { t: 0.16, ty: -1.4, r: 21, el: 44, az: 58 },
  { t: 0.30, ty: -2.0, r: 20, el: 52, az: 76 },
  { t: 0.40, ty: 2.0, r: 27, el: 30, az: 96 },
  { t: 0.56, ty: 11, r: 42, el: 22, az: 122 },
  { t: 0.72, ty: 19, r: 56, el: 19, az: 148 },
  { t: 0.80, ty: 25, r: 47, el: 13, az: 170 },
  { t: 0.87, ty: 22, r: 66, el: 15, az: 190 },
  { t: 1.00, ty: 13, r: 118, el: 22, az: 222 }
];
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function camAt(T) {
  let i = 0;
  while (i < CAM.length - 2 && T > CAM[i + 1].t) i++;
  const k0 = CAM[Math.max(0, i - 1)], k1 = CAM[i], k2 = CAM[i + 1], k3 = CAM[Math.min(CAM.length - 1, i + 2)];
  const u = seg(T, k1.t, k2.t), o = {};
  for (const key of ['ty', 'r', 'el', 'az']) o[key] = cr(k0[key], k1[key], k2[key], k3[key], u);
  return o;
}

/* =================== 3D scene (three.js r128) =================== */
function buildScene(canvas) {
  const T3 = window.THREE;
  if (!T3) throw new Error('three.js did not load');
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;

  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(36, 1, 0.5, 1400);
  const rand = rng(20261121);
  const DEG = Math.PI / 180;
  const mats = [];
  const std = (color, o) => { const m = new T3.MeshStandardMaterial(Object.assign({ color, roughness: 0.88, metalness: 0 }, o || {})); mats.push(m); return m; };
  const _m = new T3.Matrix4(), _q = new T3.Quaternion(), _p = new T3.Vector3(), _s = new T3.Vector3(), _e = new T3.Euler(), _c = new T3.Color();
  const TINY = 1e-4;
  function setI(mesh, i, x, y, z, sx, sy, sz, ry) {
    _p.set(x, y, z); _s.set(sx, sy, sz);
    if (ry) { _e.set(0, ry, 0); _q.setFromEuler(_e); } else _q.set(0, 0, 0, 1);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  const hideI = (mesh, i) => setI(mesh, i, 0, -50, 0, TINY, TINY, TINY);
  function inst(geo, mat, count, shadow) {
    const m = new T3.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(T3.DynamicDrawUsage);
    m.frustumCulled = false;
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    scene.add(m); return m;
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m); return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 4; return t;
  }
  const setScale = (o, s) => { const v = Math.max(TINY, s); o.scale.set(v, v, v); o.visible = s > 0.002; };

  /* ---- sky dome, stars, environment ---- */
  const skyU = { top: { value: new T3.Color() }, mid: { value: new T3.Color() }, bot: { value: new T3.Color() },
    sunDir: { value: new T3.Vector3(0, 1, 0) }, sunCol: { value: new T3.Color() }, glow: { value: 1 } };
  const sky = new T3.Mesh(new T3.SphereGeometry(900, 32, 16), new T3.ShaderMaterial({
    uniforms: skyU, side: T3.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;' +
      'void main(){ vec3 d = normalize(vDir); float y = d.y;' +
      ' vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(mid, bot, clamp(-y * 5.0, 0.0, 1.0));' +
      ' float s = max(dot(d, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 18.0) * 0.28 + pow(s, 900.0) * 1.4) * glow;' +
      ' gl_FragColor = vec4(c, 1.0); }'
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  const STARS = 900, starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const u = rand() * Math.PI * 2, v = 0.04 + rand() * 0.96, r = 700;
    const y = v * v, rr = Math.sqrt(1 - y * y);
    starPos[i * 3] = Math.cos(u) * rr * r; starPos[i * 3 + 1] = y * r; starPos[i * 3 + 2] = Math.sin(u) * rr * r;
  }
  const starGeo = new T3.BufferGeometry(); starGeo.setAttribute('position', new T3.BufferAttribute(starPos, 3));
  const starMat = new T3.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new T3.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

  (function makeEnv() {
    const g = new T3.SphereGeometry(10, 32, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const top = new T3.Color(0x8fbbe4), hor = new T3.Color(0xf2f3f1), gnd = new T3.Color(0x857d70), tc = new T3.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y > 0) tc.copy(hor).lerp(top, Math.pow(y, 0.6)); else tc.copy(hor).lerp(gnd, Math.min(1, -y * 4));
      col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
    }
    g.setAttribute('color', new T3.BufferAttribute(col, 3));
    const es = new T3.Scene();
    es.add(new T3.Mesh(g, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
    const sunDisc = new T3.Mesh(new T3.SphereGeometry(0.9, 12, 8), new T3.MeshBasicMaterial({ color: new T3.Color(2.6, 2.4, 2.1) }));
    sunDisc.position.set(5, 6, 4); es.add(sunDisc);
    const pm = new T3.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    pm.dispose();
  })();

  /* ---- lights ---- */
  const hemi = new T3.HemisphereLight(0xffffff, 0x6f5f4c, 0.6); scene.add(hemi);
  const sun = new T3.DirectionalLight(0xffffff, 1.1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new T3.Fog(0xe4ecef, 60, 260);

  /* ---- materials ---- */
  const mOrange = std(0xdc560c, { roughness: 0.5 });
  const mDark = std(0x2b2d31, { roughness: 0.7 });
  const mSteel = std(0x8b9096, { roughness: 0.45, metalness: 0.35 });
  const mGlassDark = std(0x23313f, { roughness: 0.15, metalness: 0.4 });
  const mWhite = std(0xf1f1ee, { roughness: 0.6 });
  const mSoil = std(0x6e4c30, { roughness: 1 });
  const mConc = std(0xb7b4ad, { roughness: 0.85 });

  /* ---- ground: voxel plot with soil strata ---- */
  const LAYER_COL = [0x6d9143, 0x6a492d, 0x9b5e37, 0xbd975f, 0x69675f];
  const vox = inst(new T3.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.96 }), PLOT * PLOT * LAYERS);
  const digIdx = new Map(); DIG.forEach((d, k) => digIdx.set(d.x + ',' + d.y + ',' + d.z, k));
  const voxels = [];
  for (let l = 0; l < LAYERS; l++) for (let i = 0; i < PLOT; i++) for (let j = 0; j < PLOT; j++) {
    const x = i - (PLOT - 1) / 2, z = j - (PLOT - 1) / 2, y = -0.5 - l, key = x + ',' + y + ',' + z;
    const n = voxels.length;
    voxels.push({ x, y, z, k: digIdx.has(key) ? digIdx.get(key) : -1, j: rand() });
    setI(vox, n, x, y, z, 1, 1, 1);
    _c.setHex(LAYER_COL[l]).multiplyScalar(0.9 + rand() * 0.16);
    vox.setColorAt(n, _c);
  }
  vox.instanceColor.needsUpdate = true;

  const softTex = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const DUST = 90, dustPos = new Float32Array(DUST * 3), dustSeed = [];
  for (let i = 0; i < DUST; i++) dustSeed.push([rand() * 6 - 3, rand() * 6 - 3, rand(), 0.6 + rand() * 0.8]);
  const dustGeo = new T3.BufferGeometry(); dustGeo.setAttribute('position', new T3.BufferAttribute(dustPos, 3));
  const dust = new T3.Points(dustGeo, new T3.PointsMaterial({ color: 0xcdb48c, size: 0.7, map: softTex, transparent: true, opacity: 0, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);

  /* ---- survey: stakes, string line, total station, blueprint ghost ---- */
  const stakeGeo = new T3.BoxGeometry(0.09, 0.9, 0.09); stakeGeo.translate(0, 0.45, 0);
  const STAKE_XY = [[-3.3, -3.3], [0, -3.3], [3.3, -3.3], [3.3, 0], [3.3, 3.3], [0, 3.3], [-3.3, 3.3], [-3.3, 0]];
  const stakes = inst(stakeGeo, std(0xffffff, { roughness: 0.6 }), STAKE_XY.length);
  STAKE_XY.forEach((s, i) => { stakes.setColorAt(i, _c.setHex(i % 2 ? 0xf2efe8 : 0xdc560c)); hideI(stakes, i); });
  stakes.instanceColor.needsUpdate = true;
  const strPos = [];
  for (let i = 0; i < 8; i++) { const a = STAKE_XY[i], b = STAKE_XY[(i + 1) % 8]; strPos.push(a[0], 0.62, a[1], b[0], 0.62, b[1]); }
  const strGeo = new T3.BufferGeometry(); strGeo.setAttribute('position', new T3.Float32BufferAttribute(strPos, 3));
  const strings = new T3.LineSegments(strGeo, new T3.LineBasicMaterial({ color: 0xff7a2e })); scene.add(strings);

  const station = new T3.Group(); station.position.set(-4.8, 0, 4.6); scene.add(station);
  for (let i = 0; i < 3; i++) {
    const leg = box(0.05, 1.05, 0.05, mSteel, 0, 0.5, 0, station);
    const a = i * Math.PI * 2 / 3;
    leg.position.set(Math.cos(a) * 0.22, 0.5, Math.sin(a) * 0.22);
    leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
  }
  box(0.26, 0.3, 0.2, std(0xf2c12e, { roughness: 0.5 }), 0, 1.15, 0, station);

  const gPos = [];
  const rect = (y, n) => { const h = n / 2, c = [[-h, -h], [h, -h], [h, h], [-h, h]]; for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; gPos.push(a[0], y, a[1], b[0], y, b[1]); } };
  const verts = (y0, y1, n) => { const h = n / 2; [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([x, z]) => gPos.push(x, y0, z, x, y1, z)); };
  for (let lv = 0; lv <= LEVELS; lv++) rect(lv - 2, tierOf(Math.min(lv, LEVELS - 1)));
  rect(22, 6); rect(30, 4); verts(-2, 22, 6); verts(22, 30, 4); verts(30, 36, 2);
  gPos.push(0, 36, 0, 0, 42, 0);
  const ghostGeo = new T3.BufferGeometry(); ghostGeo.setAttribute('position', new T3.Float32BufferAttribute(gPos, 3));
  const ghostMat = new T3.LineDashedMaterial({ color: 0x1c5fa6, dashSize: 0.32, gapSize: 0.22, transparent: true, opacity: 0.7, depthWrite: false });
  const ghost = new T3.LineSegments(ghostGeo, ghostMat); ghost.computeLineDistances(); scene.add(ghost);

  /* ---- machines ---- */
  function wheel(parent, x, z, r) {
    const w = new T3.Mesh(new T3.CylinderGeometry(r, r, 0.2, 14), mDark);
    w.rotation.x = Math.PI / 2; w.position.set(x, r, z); w.castShadow = true; parent.add(w);
  }
  // excavator, built facing +x, then turned to face the pit
  const exc = new T3.Group(); exc.position.set(5.4, 0, -0.4); exc.rotation.y = Math.PI; scene.add(exc);
  box(1.9, 0.32, 0.36, mDark, 0, 0.16, 0.5, exc); box(1.9, 0.32, 0.36, mDark, 0, 0.16, -0.5, exc);
  box(1.1, 0.22, 0.7, mDark, 0, 0.38, 0, exc);
  const excUp = new T3.Group(); excUp.position.y = 0.49; exc.add(excUp);
  box(1.3, 0.5, 1.05, mOrange, -0.15, 0.25, 0, excUp);
  box(0.55, 0.58, 0.48, mGlassDark, 0.3, 0.72, 0.27, excUp);
  box(0.42, 0.44, 1.02, mDark, -0.74, 0.3, 0, excUp);
  const boom = new T3.Group(); boom.position.set(0.45, 0.5, -0.2); excUp.add(boom);
  const bg = new T3.BoxGeometry(2.0, 0.2, 0.2); bg.translate(1.0, 0, 0);
  const boomM = new T3.Mesh(bg, mOrange); boomM.castShadow = true; boom.add(boomM);
  const stick = new T3.Group(); stick.position.set(2.0, 0, 0); boom.add(stick);
  const sg = new T3.BoxGeometry(1.4, 0.15, 0.15); sg.translate(0.7, 0, 0);
  const stickM = new T3.Mesh(sg, mOrange); stickM.castShadow = true; stick.add(stickM);
  const bucket = new T3.Group(); bucket.position.set(1.4, 0, 0); stick.add(bucket);
  const bkg = new T3.BoxGeometry(0.36, 0.34, 0.46); bkg.translate(0.12, -0.14, 0);
  const bucketM = new T3.Mesh(bkg, mDark); bucketM.castShadow = true; bucket.add(bucketM);
  const POSE = [ // phase, boom, stick, bucket, swing
    [0.00, 0.25, -0.75, 0.2, 0], [0.30, -0.22, -1.55, -1.2, 0], [0.48, 0.62, -1.5, -1.4, 0],
    [0.66, 0.6, -1.3, -1.4, 1.45], [0.78, 0.55, -0.85, 0.6, 1.45], [1.00, 0.25, -0.75, 0.2, 0]];
  const REST = [0, 0.6, -1.7, -0.9, 0];
  function excPose(phase, rest) {
    let a = REST, b = REST, u = 0;
    if (!rest) {
      let i = 0; while (i < POSE.length - 2 && phase > POSE[i + 1][0]) i++;
      a = POSE[i]; b = POSE[i + 1]; u = ease(seg(phase, a[0], b[0]));
    }
    boom.rotation.z = lerp(a[1], b[1], u); stick.rotation.z = lerp(a[2], b[2], u);
    bucket.rotation.z = lerp(a[3], b[3], u); excUp.rotation.y = lerp(a[4], b[4], u);
  }

  function makeTruck(kind) {
    const g = new T3.Group(); scene.add(g);
    box(2.5, 0.22, 0.86, mDark, 0, 0.42, 0, g);
    box(0.78, 0.78, 0.9, mOrange, 0.92, 0.93, 0, g);
    box(0.08, 0.34, 0.8, mGlassDark, 1.32, 1.05, 0, g);
    [[-0.85, 0.42], [-0.85, -0.42], [-0.3, 0.42], [-0.3, -0.42], [0.95, 0.42], [0.95, -0.42]].forEach(([x, z]) => wheel(g, x, z, 0.27));
    return g;
  }
  const dump = makeTruck('dump'); dump.position.set(4.8, 0, 3.7);
  box(1.6, 0.08, 0.9, mSteel, -0.42, 0.6, 0, dump);
  box(1.6, 0.48, 0.06, mSteel, -0.42, 0.88, 0.42, dump); box(1.6, 0.48, 0.06, mSteel, -0.42, 0.88, -0.42, dump);
  box(0.06, 0.48, 0.9, mSteel, -1.2, 0.88, 0, dump); box(0.06, 0.48, 0.9, mSteel, 0.35, 0.88, 0, dump);
  const spoilGeo = new T3.BoxGeometry(1.46, 0.6, 0.76); spoilGeo.translate(0, 0.3, 0);
  const spoil = new T3.Mesh(spoilGeo, mSoil); spoil.position.set(-0.42, 0.64, 0); spoil.castShadow = true; dump.add(spoil);
  const BED = new T3.Vector3(4.38, 1.25, 3.7);

  const mixer = makeTruck('mixer'); mixer.position.set(-5.1, 0, 0.6); mixer.rotation.y = Math.PI;
  const stripeTex = canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#f1efe9'; g.fillRect(0, 0, w, w); g.fillStyle = '#dc560c';
    for (let i = -w; i < w * 2; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 10, 0); g.lineTo(i + 10 - w, w); g.lineTo(i - w, w); g.fill(); }
  });
  const drumPivot = new T3.Group(); drumPivot.position.set(-0.35, 1.12, 0); drumPivot.rotation.z = Math.PI / 2 - 0.22; mixer.add(drumPivot);
  const drum = new T3.Mesh(new T3.CylinderGeometry(0.3, 0.46, 1.55, 18), std(0xffffff, { map: stripeTex, roughness: 0.5 }));
  drum.castShadow = true; drumPivot.add(drum);
  const chute = box(1.3, 0.06, 0.22, mSteel, -1.75, 0.7, 0, mixer); chute.rotation.z = 0.5;

  /* ---- site office, stacked materials, cones ---- */
  const props = new T3.Group(); scene.add(props);
  const office = new T3.Group(); office.position.set(-4.7, 0, -4.9); props.add(office);
  box(2.4, 0.95, 1.05, mWhite, 0, 0.48, 0, office); box(2.4, 0.95, 1.05, mWhite, 0.25, 1.44, 0.05, office);
  box(2.42, 0.16, 1.07, mOrange, 0, 0.92, 0, office);
  [-0.7, 0.1, 0.8].forEach(x => { box(0.4, 0.32, 0.04, mGlassDark, x, 0.55, 0.53, office); box(0.4, 0.32, 0.04, mGlassDark, x + 0.25, 1.5, 0.58, office); });
  const stack = new T3.Group(); stack.position.set(-5.2, 0, 4.4); props.add(stack);
  box(1.6, 0.12, 1.0, std(0x9b7a4f, { roughness: 1 }), 0, 0.06, 0, stack);
  for (let i = 0; i < 6; i++) box(1.5, 0.08, 0.08, mSteel, 0, 0.17 + Math.floor(i / 3) * 0.09, -0.3 + (i % 3) * 0.3, stack);
  box(0.7, 0.5, 0.7, mConc, 1.3, 0.25, 0.2, stack); box(0.7, 0.5, 0.7, mConc, 1.3, 0.75, 0.2, stack);
  const coneGeo = new T3.ConeGeometry(0.13, 0.42, 10); coneGeo.translate(0, 0.21, 0);
  [[3.6, 6.2], [5.2, 6.2], [6.4, 1.8], [6.4, -2.4]].forEach(([x, z]) => {
    const c = new T3.Mesh(coneGeo, mOrange); c.position.set(x, 0, z); c.castShadow = true; props.add(c);
  });
  // site hoarding at the plot entrance
  const board = new T3.Group(); board.position.set(0.6, 0, 6.35); props.add(board);
  box(0.12, 2.3, 0.12, mDark, -1.9, 1.15, 0, board); box(0.12, 2.3, 0.12, mDark, 1.9, 1.15, 0, board);
  const boardTex = canvasTex(512, 192, (g, w, h) => {
    const fit = (txt, maxW, size, font) => { let z = size; do { g.font = font.replace('#', z); z -= 2; } while (g.measureText(txt).width > maxW && z > 10); };
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dc560c'; g.fillRect(0, 0, 128, h);
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; fit('VLL', 104, 60, '800 #px Archivo, Arial, sans-serif'); g.fillText('VLL', 14, h / 2);
    g.fillStyle = '#15191d'; fit('BOOKINGS OPEN', 360, 50, '800 #px Archivo, Arial, sans-serif'); g.fillText('BOOKINGS OPEN', 146, 72);
    g.fillStyle = '#4d5760'; fit('TOWER 01 · HOMES · OFFICES · RETAIL', 356, 24, '500 #px "IBM Plex Mono", Menlo, monospace'); g.fillText('TOWER 01 · HOMES · OFFICES · RETAIL', 148, 132);
  });
  const boardFace = new T3.Mesh(new T3.BoxGeometry(4.2, 1.58, 0.08), [mWhite, mWhite, mWhite, mWhite, std(0xffffff, { map: boardTex, roughness: 0.7 }), mWhite]);
  boardFace.position.set(0, 1.55, 0.07); boardFace.castShadow = true; board.add(boardFace);

  /* ---- foundation: piles, rebar mats, raft ---- */
  const pileGeo = new T3.CylinderGeometry(0.2, 0.2, 2.3, 12); pileGeo.translate(0, -1.15, 0);
  const piles = inst(pileGeo, std(0xbdb9b0, { roughness: 0.8 }), 16);
  const PILE_XZ = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) PILE_XZ.push([-2.25 + i * 1.5, -2.25 + (i % 2 ? 3 - j : j) * 1.5]);
  PILE_XZ.forEach((_, i) => hideI(piles, i));
  const rbPos = [];
  [-2.78, -2.32].forEach(y => {
    for (let i = 0; i < 20; i++) { const v = -2.85 + i * 0.3; rbPos.push(v, y, -2.95, v, y, 2.95); }
    for (let i = 0; i < 20; i++) { const v = -2.85 + i * 0.3; rbPos.push(-2.95, y, v, 2.95, y, v); }
  });
  const rbGeo = new T3.BufferGeometry(); rbGeo.setAttribute('position', new T3.Float32BufferAttribute(rbPos, 3));
  const rebar = new T3.LineSegments(rbGeo, new T3.LineBasicMaterial({ color: 0xb4532a })); scene.add(rebar);
  const RB_SEGS = rbPos.length / 6;
  const raftGeo = new T3.BoxGeometry(5.98, 1, 5.98); raftGeo.translate(0, 0.5, 0);
  const raftMat = std(0x5b6065, { roughness: 0.35 });
  const raft = new T3.Mesh(raftGeo, raftMat); raft.position.set(0, -3, 0); raft.castShadow = raft.receiveShadow = true; scene.add(raft);
  const WET = new T3.Color(0x585d62), CURED = new T3.Color(0xb3b0a8);

  /* ---- tower: modules and slabs ---- */
  const blocks = inst(new T3.BoxGeometry(0.94, 0.94, 0.94), std(0xffffff, { roughness: 0.82 }), NB);
  BLOCKS.forEach((b, i) => {
    const base = b.core ? 0x8e8b86 : b.lv < 2 ? 0xa29e96 : tierOf(b.lv) === 6 ? 0xb9b5ad : 0xc6c2ba;
    blocks.setColorAt(i, _c.setHex(base).multiplyScalar(0.94 + rand() * 0.1)); hideI(blocks, i);
  });
  blocks.instanceColor.needsUpdate = true;
  const slabs = inst(new T3.BoxGeometry(1, 0.1, 1), std(0xd4d1ca, { roughness: 0.8 }), LEVELS);
  for (let lv = 0; lv < LEVELS; lv++) hideI(slabs, lv);

  /* ---- climbing tower crane ---- */
  const lattice = canvasTex(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w); g.strokeStyle = '#e0570c'; g.lineWidth = 7;
    g.strokeRect(3, 3, w - 6, w - 6); g.lineWidth = 5;
    g.beginPath(); g.moveTo(3, 3); g.lineTo(w - 3, w - 3); g.moveTo(w - 3, 3); g.lineTo(3, w - 3); g.stroke();
  });
  const latMat = (rx, ry) => { const t = lattice.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return std(0xffffff, { map: t, alphaTest: 0.5, side: T3.DoubleSide, roughness: 0.55 }); };
  const CRANE = new T3.Vector3(5.4, 0, -5.4);
  const crane = new T3.Group(); crane.position.copy(CRANE); scene.add(crane);
  box(1.5, 0.4, 1.5, mConc, 0, 0.2, 0, crane);
  const mastGeo = new T3.BoxGeometry(0.7, 1, 0.7); mastGeo.translate(0, 0.5, 0);
  const mastMat = latMat(1, 10);
  const mast = new T3.Mesh(mastGeo, mastMat); mast.position.y = 0.4; mast.castShadow = true; crane.add(mast);
  const head = new T3.Group(); crane.add(head);
  const jibGeo = new T3.BoxGeometry(13, 0.55, 0.55); jibGeo.translate(6.2, 0, 0);
  const jib = new T3.Mesh(jibGeo, latMat(24, 1)); jib.castShadow = true; head.add(jib);
  const cjGeo = new T3.BoxGeometry(4.4, 0.5, 0.55); cjGeo.translate(-2.2, 0, 0);
  const cjib = new T3.Mesh(cjGeo, latMat(8, 1)); cjib.castShadow = true; head.add(cjib);
  box(0.9, 0.8, 0.9, mConc, -3.7, -0.55, 0, head); box(0.9, 0.8, 0.9, mConc, -2.7, -0.55, 0, head);
  const apexGeo = new T3.BoxGeometry(0.45, 2.6, 0.45); apexGeo.translate(0, 1.3, 0);
  const apex = new T3.Mesh(apexGeo, latMat(1, 5)); apex.castShadow = true; head.add(apex);
  box(0.7, 0.62, 0.62, mGlassDark, 0.55, -0.55, 0.62, head);
  const tieGeo = new T3.BufferGeometry(); tieGeo.setAttribute('position', new T3.Float32BufferAttribute([0, 2.6, 0, 8.5, 0.25, 0, 0, 2.6, 0, -4.3, 0.25, 0], 3));
  head.add(new T3.LineSegments(tieGeo, new T3.LineBasicMaterial({ color: 0x3a3d42 })));
  const trolley = box(0.55, 0.18, 0.6, mDark, 6, -0.36, 0, head);
  const cableGeo = new T3.BoxGeometry(0.035, 1, 0.035); cableGeo.translate(0, -0.5, 0);
  const cable = new T3.Mesh(cableGeo, mDark); head.add(cable);
  const hook = box(0.32, 0.34, 0.24, std(0xf2c12e, { roughness: 0.5 }), 6, -2, 0, head);
  const load = box(0.94, 0.94, 0.94, std(0xb9b5ad, { roughness: 0.82 }), 6, -2.7, 0, head);
  load.scale.setScalar(0.55);
  const crs = { ang: 2.36, dist: 7, mast: 9, hookY: 6 };

  /* ---- envelope: glass, lit windows, spire, beacon ---- */
  const glassTex = canvasTex(128, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c9d6de');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#2c3238';
    g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h); g.fillRect(0, Math.round(h * 0.68), w, 3);
  });
  const glass = {}, panelsOf = {};
  [6, 4, 2].forEach(n => {
    const t = glassTex.clone(); t.needsUpdate = true; t.repeat.set(n, 1);
    const m = std(0x9bc0d6, { map: t, metalness: 0.62, roughness: 0.14 }); m.userData.envBoost = 1.5;
    const list = [];
    for (let lv = 2; lv < LEVELS; lv++) if (tierOf(lv) === n) for (let s = 0; s < 4; s++) list.push({ lv, s });
    glass[n] = inst(new T3.BoxGeometry(n, 0.9, 0.05), m, list.length);
    glass[n].receiveShadow = true; panelsOf[n] = list;
    list.forEach((_, i) => hideI(glass[n], i));
  });
  const LIT = [];
  const litCols = [0xffd598, 0xffe4b8, 0xfff1dc, 0xffcf87, 0xdfeeff];
  for (let lv = 2; lv < LEVELS; lv++) {
    const n = tierOf(lv);
    for (let s = 0; s < 4; s++) for (let b = 0; b < n; b++) if (rand() < 0.62) LIT.push({ lv, s, off: b - (n - 1) / 2, n, r: rand(), col: litCols[Math.floor(rand() * litCols.length)] });
  }
  const lit = inst(new T3.PlaneGeometry(0.8, 0.62), new T3.MeshBasicMaterial({ color: 0xffffff }), LIT.length, false);
  LIT.forEach((w, i) => { lit.setColorAt(i, _c.setHex(w.col)); hideI(lit, i); });
  lit.instanceColor.needsUpdate = true;
  const spireGeo = new T3.CylinderGeometry(0.03, 0.17, 6, 8); spireGeo.translate(0, 3, 0);
  const spire = new T3.Mesh(spireGeo, mSteel); spire.position.y = 36; spire.castShadow = true; scene.add(spire);
  const beacon = new T3.Mesh(new T3.SphereGeometry(0.16, 12, 8), new T3.MeshBasicMaterial({ color: 0xff3020 }));
  beacon.position.y = 42.1; scene.add(beacon);

  /* ---- handover: plaza and trees ---- */
  const plaza = new T3.Mesh(new T3.BoxGeometry(10.4, 0.06, 10.4), std(0xcbc8c0, { roughness: 0.9 }));
  plaza.position.y = 0.03; plaza.receiveShadow = true; scene.add(plaza);
  const TREES = [];
  for (let i = 0; i < 6; i++) { const v = -5.6 + i * 2.24; TREES.push([v, -6.1, 0], [v, 6.1, 0], [-6.1, v, 0], [6.1, v, 0]); }

  /* ---- the city that rises around it ---- */
  const LOTS = [], PIECES = [], CITY_LIGHTS = [];
  const facade = [0xcdc7ba, 0x9aa8b5, 0xdcdad3, 0x7f8c99, 0xb08a6e, 0x6f8faa, 0xa9b1a7, 0xe2ddd2];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (!i && !j) continue;
    const ring = Math.max(Math.abs(i), Math.abs(j)), park = rand() < 0.16;
    const lot = { x: i * 16, z: j * 16, ring, park, d: (ring - 1) * 0.24 + rand() * 0.14 };
    LOTS.push(lot);
    for (let t = 0; t < 3; t++) TREES.push([lot.x + (rand() - 0.5) * 12, lot.z + (rand() - 0.5) * 12, 1, lot]);
    if (park) { for (let t = 0; t < 5; t++) TREES.push([lot.x + (rand() - 0.5) * 11, lot.z + (rand() - 0.5) * 11, 1, lot]); continue; }
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      if (rand() < 0.28) continue;
      const w = 3 + rand() * 3, dd = 3 + rand() * 3;
      let h = (3 + Math.pow(rand(), 1.6) * 22) * (1 - 0.12 * (ring - 1));
      if (rand() < 0.14) h = 18 + rand() * 12;
      const x = lot.x + (a ? 3.5 : -3.5) + (rand() - 0.5), z = lot.z + (b ? 3.5 : -3.5) + (rand() - 0.5);
      const col = facade[Math.floor(rand() * facade.length)], crown = h > 10 && rand() < 0.4 ? 1.5 + rand() * 3 : 0;
      const bld = { lot, start: lot.d + 0.1 + rand() * 0.25, H: h + crown };
      PIECES.push({ bld, x, z, w, d: dd, y0: 0, h, col });
      if (crown) PIECES.push({ bld, x, z, w: w * 0.62, d: dd * 0.62, y0: h, h: crown, col: 0x5b6672 });
      for (let f = 0; f < 4; f++) {
        const nx = f === 0 ? 1 : f === 1 ? -1 : 0, nz = f === 2 ? 1 : f === 3 ? -1 : 0;
        const span = nx ? dd : w, cols = Math.max(1, Math.floor(span / 0.95));
        for (let yy = 0.7; yy < h - 0.3; yy += 1.05) for (let c = 0; c < cols; c++) {
          if (rand() > 0.3) continue;
          const o = (c + 0.5) / cols * span - span / 2;
          CITY_LIGHTS.push(x + nx * (w / 2 + 0.07) + (nz ? o : 0), yy, z + nz * (dd / 2 + 0.07) + (nx ? o : 0));
        }
      }
    }
  }
  const boxUp = new T3.BoxGeometry(1, 1, 1); boxUp.translate(0, 0.5, 0);
  const lots = inst(new T3.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), std(0xffffff, { roughness: 0.95 }), LOTS.length);
  LOTS.forEach((l, i) => { lots.setColorAt(i, _c.setHex(l.park ? 0x6e9045 : 0xa4a39c).multiplyScalar(0.94 + rand() * 0.1)); hideI(lots, i); });
  lots.instanceColor.needsUpdate = true;
  const city = inst(boxUp, std(0xffffff, { roughness: 0.62, metalness: 0.08 }), PIECES.length);
  PIECES.forEach((p, i) => { city.setColorAt(i, _c.setHex(p.col)); hideI(city, i); });
  city.instanceColor.needsUpdate = true;
  const streets = new T3.Mesh(new T3.BoxGeometry(114, 0.6, 114), std(0x3a3d43, { roughness: 0.95 }));
  streets.position.y = -0.39; streets.receiveShadow = true; scene.add(streets);
  const lanePos = [];
  for (let k = -4; k <= 3; k++) { const v = 8 + k * 16; lanePos.push(v, -0.07, -56, v, -0.07, 56, -56, -0.07, v, 56, -0.07, v); }
  const laneGeo = new T3.BufferGeometry(); laneGeo.setAttribute('position', new T3.Float32BufferAttribute(lanePos, 3));
  const lanes = new T3.LineSegments(laneGeo, new T3.LineDashedMaterial({ color: 0xe9e4d6, dashSize: 0.9, gapSize: 0.9, transparent: true, opacity: 0 }));
  lanes.computeLineDistances(); scene.add(lanes);

  const trunkGeo = new T3.CylinderGeometry(0.07, 0.1, 0.7, 6); trunkGeo.translate(0, 0.35, 0);
  const crownGeo = new T3.IcosahedronGeometry(0.62, 0); crownGeo.translate(0, 1.15, 0);
  const trunks = inst(trunkGeo, std(0x6b4c33), TREES.length);
  const crowns = inst(crownGeo, std(0xffffff, { roughness: 0.9, flatShading: true }), TREES.length);
  TREES.forEach((t, i) => { crowns.setColorAt(i, _c.setHex([0x5f8a3c, 0x6f9a43, 0x4f7a37][i % 3])); hideI(trunks, i); hideI(crowns, i); t.s = 0.8 + rand() * 0.6; t.r = rand(); });
  crowns.instanceColor.needsUpdate = true;

  const cl = new Float32Array(CITY_LIGHTS), clCol = new Float32Array(cl.length);
  for (let i = 0; i < cl.length; i += 3) { _c.setHex(rand() < 0.8 ? 0xffd9a0 : 0xd8e8ff).multiplyScalar(0.75 + rand() * 0.25); clCol[i] = _c.r; clCol[i + 1] = _c.g; clCol[i + 2] = _c.b; }
  const clGeo = new T3.BufferGeometry(); clGeo.setAttribute('position', new T3.BufferAttribute(cl, 3)); clGeo.setAttribute('color', new T3.BufferAttribute(clCol, 3));
  const cityLights = new T3.Points(clGeo, new T3.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
  cityLights.frustumCulled = false; scene.add(cityLights);

  const CARS = 150, carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3), carData = [];
  for (let i = 0; i < CARS; i++) {
    const axis = rand() < 0.5 ? 0 : 1, dir = rand() < 0.5 ? 1 : -1, line = 8 + (Math.floor(rand() * 8) - 4) * 16;
    carData.push({ axis, dir, c: line + dir * 0.45, ph: rand() * 112, v: 5 + rand() * 5 });
    _c.setHex(dir > 0 ? 0xfff0cf : 0xff4a36); carCol[i * 3] = _c.r; carCol[i * 3 + 1] = _c.g; carCol[i * 3 + 2] = _c.b;
  }
  const carGeo = new T3.BufferGeometry(); carGeo.setAttribute('position', new T3.BufferAttribute(carPos, 3)); carGeo.setAttribute('color', new T3.BufferAttribute(carCol, 3));
  const cars = new T3.Points(carGeo, new T3.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
  cars.frustumCulled = false; scene.add(cars);

  const CLOUDS = [];
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, r = 34 + rand() * 50, y = 24 + rand() * 18, n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) CLOUDS.push({ x: Math.cos(a) * r + (k - n / 2) * 2.4, y: y + rand() * 1.2, z: Math.sin(a) * r + (rand() - 0.5) * 2.5, w: 2.5 + rand() * 3, h: 1.2 + rand() * 1.4, d: 2.2 + rand() * 2.5, v: 0.6 + (i % 3) * 0.25 });
  }
  const cloudMat = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9, depthWrite: false });
  const clouds = inst(new T3.BoxGeometry(1, 1, 1), cloudMat, CLOUDS.length, false);

  /* ---- per-frame update: everything is a function of T (scroll) plus a little ambient time ---- */
  const last = {};
  const changed = (k, v) => { if (last[k] === v) return false; last[k] = v; return true; };
  const camT = new T3.Vector3(), sunDir = new T3.Vector3();
  let fit = 1;
  const lotU = l => clamp(lastLots * 1.7 - l.d, 0, 1);
  const lotY = l => lerp(-26, 0, easeOut(lotU(l)));
  let lastLots = 0;

  function update(T, time, dt) {
    const p = phases(T), s = skyAt(T), c = camAt(T), night = s.night;
    const amb = reduceMotion ? 0 : 1;
    const intro = reduceMotion ? 1 : clamp((time - 0.2) / 2.4, 0, 1);
    lastLots = p.lots;

    // camera on a slow orbit around the work
    const az = (c.az + Math.sin(time * 0.12) * 2.2 * amb) * DEG, el = (c.el + Math.sin(time * 0.09) * 0.8 * amb) * DEG, r = c.r * fit;
    camera.position.set(Math.cos(el) * Math.sin(az) * r, c.ty + Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
    camT.set(0, c.ty, 0); camera.lookAt(camT);
    sky.position.copy(camera.position); stars.position.copy(camera.position);

    // sky, sun, fog
    skyU.top.value.setRGB(s.top[0], s.top[1], s.top[2]); skyU.mid.value.setRGB(s.mid[0], s.mid[1], s.mid[2]);
    skyU.bot.value.setRGB(s.bot[0], s.bot[1], s.bot[2]); skyU.sunCol.value.setRGB(s.sun[0], s.sun[1], s.sun[2]);
    const se = s.el * DEG, sa = s.az * DEG;
    sunDir.set(Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa));
    skyU.sunDir.value.copy(sunDir); skyU.glow.value = 1 - night;
    starMat.opacity = Math.pow(night, 1.6) * 0.9; stars.visible = starMat.opacity > 0.01;
    scene.fog.color.setRGB(s.mid[0], s.mid[1], s.mid[2]); scene.fog.near = r * 0.9; scene.fog.far = r * 3.6;
    hemi.intensity = s.hemi;
    hemi.color.setRGB(0.55 + s.top[0] * 0.45, 0.55 + s.top[1] * 0.45, 0.55 + s.top[2] * 0.45);
    hemi.groundColor.setHex(0x6f5f4c).multiplyScalar(1 - 0.7 * night);
    sun.color.setRGB(s.sun[0], s.sun[1], s.sun[2]); sun.intensity = s.sunI;
    sun.position.copy(sunDir).multiplyScalar(150); sun.target.position.set(0, 0, 0);
    const S = Math.round(lerp(13, 72, ease(seg(T, 0.36, 1))));
    if (changed('S', S)) { const sc = sun.shadow.camera; sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); }
    for (let i = 0; i < mats.length; i++) mats[i].envMapIntensity = s.env * (mats[i].userData.envBoost || 1);

    // survey: plays once on load, then follows the scroll
    const sv = Math.max(p.survey, intro), gone = seg(p.found, 0, 0.12);
    if (changed('stk', sv + gone * 10)) {
      STAKE_XY.forEach((st, i) => {
        const u = seg(sv, i * 0.07, i * 0.07 + 0.3), sc = u > 0 ? easeOutBack(u) * (1 - gone) : 0;
        if (sc <= 0.001) hideI(stakes, i); else setI(stakes, i, st[0], 0, st[1], 1, sc, 1);
      });
      stakes.instanceMatrix.needsUpdate = true;
      strings.geometry.setDrawRange(0, Math.floor(seg(sv, 0.5, 1) * (1 - gone) * 8) * 2);
      setScale(station, easeOutBack(seg(sv, 0.15, 0.5)) * (1 - gone));
    }
    ghostMat.opacity = 0.72 * seg(intro, 0, 0.6) * (1 - 0.5 * p.frame) * (1 - p.facade);
    ghost.visible = ghostMat.opacity > 0.01;

    // excavation
    if (changed('dig', p.dig)) {
      for (let n = 0; n < voxels.length; n++) {
        const v = voxels[n]; if (v.k < 0) continue;
        const u = clamp((p.dig - v.k / ND * (1 - DIG_W)) / DIG_W, 0, 1);
        if (u <= 0) setI(vox, n, v.x, v.y, v.z, 1, 1, 1);
        else if (u >= 1) hideI(vox, n);
        else {
          const e = ease(u), o = 1 - e, mx = (v.x + BED.x) / 2, mz = (v.z + BED.z) / 2, my = BED.y + 3.5;
          const bx = o * o * v.x + 2 * o * e * mx + e * e * (BED.x + (v.j - 0.5) * 0.8);
          const by = o * o * v.y + 2 * o * e * my + e * e * BED.y;
          const bz = o * o * v.z + 2 * o * e * mz + e * e * (BED.z + (v.j - 0.5) * 0.4);
          const sc = lerp(1, 0.42, ease(seg(u, 0, 0.35))) * (1 - seg(u, 0.82, 1));
          setI(vox, n, bx, by, bz, Math.max(TINY, sc), Math.max(TINY, sc), Math.max(TINY, sc), u * 4);
        }
      }
      vox.instanceMatrix.needsUpdate = true;
      spoil.scale.y = Math.max(TINY, p.dig); spoil.visible = p.dig > 0;
    }
    const digging = p.dig > 0 && p.dig < 1;
    excPose(digging ? (p.dig * 9) % 1 : 0, !digging);
    exc.position.x = 5.4 + easeIn(p.digOut) * 3; setScale(exc, 1 - seg(p.digOut, 0.4, 1));
    dump.position.x = 4.8 + easeIn(p.digOut) * 5; setScale(dump, 1 - seg(p.digOut, 0.5, 1));
    const dustOn = (digging ? 0.55 : 0) + (p.piles > 0 && p.piles < 1 ? 0.35 : 0);
    dust.material.opacity = dustOn; dust.visible = dustOn > 0;
    if (dustOn > 0) {
      const floorY = -3 * p.dig;
      for (let i = 0; i < DUST; i++) {
        const d = dustSeed[i], life = (time * 0.35 * d[3] + d[2]) % 1;
        dustPos[i * 3] = d[0] + Math.sin(time * 0.5 + i) * 0.3; dustPos[i * 3 + 1] = floorY + life * 3.2; dustPos[i * 3 + 2] = d[1];
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // foundation
    if (changed('pile', p.piles)) {
      PILE_XZ.forEach((xz, i) => {
        const u = seg(p.piles, i / 16 * 0.72, i / 16 * 0.72 + 0.28);
        if (u <= 0) hideI(piles, i); else setI(piles, i, xz[0], lerp(9, -2.7, easeIn(u)), xz[1], 1, 1, 1);
      });
      piles.instanceMatrix.needsUpdate = true;
    }
    rebar.geometry.setDrawRange(0, Math.floor(p.rebar * RB_SEGS) * 2); rebar.visible = p.rebar > 0;
    raft.scale.y = Math.max(TINY, p.pour); raft.visible = p.pour > 0;
    const cure = seg(T, 0.37, 0.45);
    raftMat.color.copy(WET).lerp(CURED, cure); raftMat.roughness = lerp(0.3, 0.88, cure);
    setScale(mixer, easeOutBack(seg(p.found, 0.48, 0.56)) * (1 - seg(p.found, 0.95, 1)));
    if (mixer.visible) drum.rotation.y = time * 2.4;
    chute.visible = p.pour > 0 && p.pour < 1;

    // superstructure: modules drop in, slabs unfold when a level closes
    const prog = buildProgress(p);
    if (changed('prog', prog)) {
      for (let k = 0; k < NB; k++) {
        const b = BLOCKS[k], u = clamp((prog - k) / FLIGHT, 0, 1);
        if (u <= 0) { hideI(blocks, k); continue; }
        if (u >= 1) { setI(blocks, k, b.x, b.y, b.z, 1, 1, 1); continue; }
        const sc = lerp(0.55, 1, ease(seg(u, 0, 0.45)));
        setI(blocks, k, b.x, b.y + 3.2 * (1 - easeOut(u)), b.z, sc, sc, sc);
      }
      blocks.instanceMatrix.needsUpdate = true;
      for (let lv = 0; lv < LEVELS; lv++) {
        const su = clamp((prog - LEVEL_END[lv] - FLIGHT) / SLAB_LAG, 0, 1), n = (tierOf(lv) + 0.16) * easeOut(su);
        if (su <= 0) hideI(slabs, lv); else setI(slabs, lv, 0, lv - 1, 0, n, 1, n);
      }
      slabs.instanceMatrix.needsUpdate = true;
    }

    // crane climbs with the building and swings to the next module
    const top = topLevelDone(blocksDone(p)), builtTop = top >= 0 ? top - 1 : -2;
    crs.mast += (Math.max(9, builtTop + 6) - crs.mast) * Math.min(1, dt * 4);
    const mastH = crs.mast * easeOut(p.craneUp) * (1 - ease(seg(p.craneDown, 0.35, 1)));
    crane.visible = p.craneUp > 0 && p.craneDown < 1;
    if (crane.visible) {
      mast.scale.y = Math.max(TINY, mastH); mastMat.map.repeat.set(1, Math.max(1, mastH / 0.7));
      const headY = 0.4 + mastH; head.position.y = headY;
      setScale(head, ease(seg(p.craneUp, 0.5, 1)) * (1 - ease(seg(p.craneDown, 0, 0.4))));
      const working = p.frame > 0 && p.frame < 1, tb = BLOCKS[clamp(Math.floor(prog), 0, NB - 1)];
      let tx = tb.x - CRANE.x, tz = tb.z - CRANE.z, ty = tb.y + 3.2;
      if (!working) { tx = -7; tz = 7; ty = headY - 3; }
      const tA = Math.atan2(-tz, tx), tD = clamp(Math.hypot(tx, tz), 1.6, 12.4);
      const dA = ((tA - crs.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI, k = Math.min(1, dt * 5);
      crs.ang += dA * k; crs.dist += (tD - crs.dist) * k; crs.hookY += (ty - crs.hookY) * k;
      head.rotation.y = crs.ang + Math.sin(time * 0.7) * 0.02 * amb;
      const hl = Math.min(-0.9, crs.hookY - headY);
      trolley.position.x = cable.position.x = hook.position.x = load.position.x = crs.dist;
      cable.position.y = -0.45; cable.scale.y = Math.max(TINY, -hl - 0.45);
      hook.position.y = hl; load.position.y = hl - 0.62; load.visible = working;
    }

    // envelope
    if (changed('fac', p.facade)) {
      const fp = p.facade * (36 + 1.8);
      [6, 4, 2].forEach(n => {
        const g = glass[n];
        panelsOf[n].forEach((pn, i) => {
          const u = clamp(fp - (pn.lv - 2) - pn.s * 0.2, 0, 1);
          if (u <= 0) { hideI(g, i); return; }
          const ry = pn.s * Math.PI / 2, d = n / 2 + 0.03, e = easeOut(u);
          setI(g, i, Math.sin(ry) * d, pn.lv - 1.5 - (1 - e) * 1.4, Math.cos(ry) * d, Math.max(TINY, e), 1, 1, ry);
        });
        g.instanceMatrix.needsUpdate = true;
      });
    }
    const lights = seg(night, 0.05, 0.95);
    if (changed('lit', Math.round(lights * 300) + (p.facade >= 1 ? 1000 : 0))) {
      LIT.forEach((w, i) => {
        if (p.facade < 1 || lights < w.r * 0.92 + 0.04) { hideI(lit, i); return; }
        const ry = w.s * Math.PI / 2, d = w.n / 2 + 0.064;
        setI(lit, i, Math.sin(ry) * d + Math.cos(ry) * w.off, w.lv - 1.48, Math.cos(ry) * d - Math.sin(ry) * w.off, 1, 1, 1, ry);
      });
      lit.instanceMatrix.needsUpdate = true;
    }
    const sp = easeOut(p.spire);
    spire.scale.y = Math.max(TINY, sp); spire.visible = sp > 0.001;
    beacon.position.y = 36.1 + 6 * sp;
    beacon.visible = sp > 0.98 && night > 0.2 && (!amb || Math.sin(time * 3.2) > -0.2);

    // handover and the city
    props.children.forEach(ch => setScale(ch, 1 - ease(p.tidy)));
    plaza.visible = p.tidy > 0; plaza.scale.set(Math.max(TINY, ease(p.tidy)), 1, Math.max(TINY, ease(p.tidy)));
    if (changed('lots', p.lots)) {
      LOTS.forEach((l, i) => { if (lotU(l) <= 0) hideI(lots, i); else setI(lots, i, l.x, lotY(l), l.z, 14, 1.2, 14); });
      lots.instanceMatrix.needsUpdate = true;
      const st = Math.max(TINY, easeOut(seg(p.lots, 0, 0.35)));
      streets.scale.set(st, 1, st); streets.visible = p.lots > 0;
    }
    lanes.material.opacity = seg(p.lots, 0.5, 1) * 0.75 * (1 - 0.5 * night); lanes.visible = lanes.material.opacity > 0.01;
    if (changed('trees', p.tidy * 7 + p.lots)) {
      TREES.forEach((t, i) => {
        const u = t[2] ? seg(lotU(t[3]), 0.7 + t.r * 0.2, 1) : seg(p.tidy, 0.3 + t.r * 0.4, 0.75 + t.r * 0.25);
        if (u <= 0) { hideI(trunks, i); hideI(crowns, i); return; }
        const sc = easeOutBack(u) * t.s, y = t[2] ? lotY(t[3]) : 0;
        setI(trunks, i, t[0], y, t[1], sc, sc, sc); setI(crowns, i, t[0], y, t[1], sc, sc, sc);
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
    }
    if (changed('grow', p.grow * 10 + p.lots)) {
      PIECES.forEach((pc, i) => {
        const g = clamp((p.grow - pc.bld.start * 0.6) / 0.36, 0, 1);
        const vis = clamp(easeOut(g) * pc.bld.H - pc.y0, 0, pc.h);
        if (vis <= 0.01 || lotU(pc.bld.lot) < 1) hideI(city, i);
        else setI(city, i, pc.x, pc.y0, pc.z, pc.w, vis, pc.d);
      });
      city.instanceMatrix.needsUpdate = true;
    }
    cityLights.material.opacity = seg(night, 0.15, 0.9) * (p.grow >= 1 ? 1 : 0); cityLights.visible = cityLights.material.opacity > 0.01;
    cars.material.opacity = seg(night, 0.3, 0.9) * seg(p.lots, 0.8, 1); cars.visible = cars.material.opacity > 0.01;
    if (cars.visible) {
      for (let i = 0; i < CARS; i++) {
        const cd = carData[i], v = ((cd.ph + time * cd.v * cd.dir * amb) % 112 + 112) % 112 - 56;
        carPos[i * 3] = cd.axis ? v : cd.c; carPos[i * 3 + 1] = 0.22; carPos[i * 3 + 2] = cd.axis ? cd.c : v;
      }
      carGeo.attributes.position.needsUpdate = true;
    }
    cloudMat.opacity = 0.9 * (1 - seg(night, 0.2, 0.7)); clouds.visible = cloudMat.opacity > 0.01;
    if (clouds.visible) {
      CLOUDS.forEach((cd, i) => setI(clouds, i, ((cd.x + time * cd.v * amb + 120) % 240 + 240) % 240 - 120, cd.y, cd.z, cd.w, cd.h, cd.d));
      clouds.instanceMatrix.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    if (w < 761) {
      camera.fov = 44; camera.aspect = w / (h * 1.34); camera.setViewOffset(w, h * 1.34, 0, h * 0.34, w, h);
      fit = clamp(Math.pow(1.25 / (w / h), 0.7), 1, 1.9);
    } else {
      camera.fov = 36; camera.aspect = (w * 1.26) / h; camera.setViewOffset(w * 1.26, h, 0, 0, w, h);
      fit = clamp(Math.pow(1.6 / (w / h), 0.6), 1, 1.5);
    }
    camera.updateProjectionMatrix();
  }
  return { update, resize };
}

/* =================== page =================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* sector models: [x, y, w, d, h, z, class] in px on a 140 x 140 plan */
const MODELS = {
  res: [[8, 14, 124, 112, 10, 0, 'solid'], [20, 26, 40, 40, 150, 10, ''], [80, 70, 40, 40, 104, 10, 'glass'], [86, 22, 30, 30, 58, 10, '']],
  com: [[10, 20, 120, 100, 28, 0, 'glass'], [30, 35, 78, 62, 70, 28, ''], [46, 48, 46, 36, 40, 98, 'glass']],
  ind: [[6, 40, 128, 64, 34, 0, 'solid'], [18, 48, 24, 48, 8, 34, 'glass'], [58, 48, 24, 48, 8, 34, 'glass'], [98, 48, 24, 48, 8, 34, 'glass'], [112, 12, 12, 12, 96, 0, 'solid'], [14, 10, 24, 24, 30, 0, '']],
  inf: [[16, 58, 12, 24, 46, 0, 'solid'], [64, 58, 12, 24, 46, 0, 'solid'], [112, 58, 12, 24, 46, 0, 'solid'], [0, 56, 140, 28, 6, 46, 'solid'], [66, 46, 8, 8, 66, 52, 'solid'], [66, 86, 8, 8, 66, 52, 'solid']]
};
const HOME_MODELS = {
  apartments: [[8, 14, 124, 112, 10, 0, 'solid'], [20, 26, 40, 40, 150, 10, ''], [80, 70, 40, 40, 104, 10, 'glass'], [86, 22, 30, 30, 58, 10, ''], [16, 86, 14, 14, 22, 10, 'green'], [42, 98, 12, 12, 18, 10, 'green']],
  villas: [[4, 4, 132, 132, 3, 0, 'green solid'], [62, 4, 16, 132, 4, 0, 'solid'],
    [12, 10, 38, 30, 26, 3, ''], [16, 12, 26, 24, 14, 29, 'glass'], [12, 54, 38, 30, 26, 3, ''], [16, 56, 26, 24, 14, 29, 'glass'], [12, 98, 38, 30, 26, 3, ''], [16, 100, 26, 24, 14, 29, 'glass'],
    [90, 10, 38, 30, 26, 3, ''], [98, 12, 26, 24, 14, 29, 'glass'], [90, 54, 38, 30, 26, 3, ''], [98, 56, 26, 24, 14, 29, 'glass'], [90, 98, 38, 30, 26, 3, ''], [98, 100, 26, 24, 14, 29, 'glass'],
    [52, 44, 8, 8, 22, 3, 'green'], [80, 88, 8, 8, 22, 3, 'green']],
  plots: [[4, 4, 132, 132, 2, 0, 'green solid'], [4, 62, 132, 16, 3, 0, 'solid'],
    [8, 8, 28, 50, 3, 2, 'solid'], [40, 8, 28, 50, 3, 2, 'solid'], [72, 8, 28, 50, 3, 2, 'solid'], [104, 8, 28, 50, 3, 2, 'solid'],
    [8, 82, 28, 50, 3, 2, 'solid'], [40, 82, 28, 50, 3, 2, 'solid'], [72, 82, 28, 50, 3, 2, 'solid'], [104, 82, 28, 50, 3, 2, 'solid'],
    [76, 86, 3, 3, 32, 5, 'solid'], [95, 86, 3, 3, 32, 5, 'solid'], [76, 125, 3, 3, 32, 5, 'solid'], [95, 125, 3, 3, 32, 5, 'solid'], [74, 84, 26, 46, 3, 20, 'solid'],
    [37, 6, 3, 3, 16, 2, 'accent'], [69, 6, 3, 3, 16, 2, 'accent'], [101, 6, 3, 3, 16, 2, 'accent'], [37, 130, 3, 3, 16, 2, 'accent']],
  commercial: [[10, 20, 120, 100, 28, 0, 'glass'], [30, 35, 78, 62, 70, 28, ''], [46, 48, 46, 36, 40, 98, 'glass'], [12, 6, 10, 10, 18, 0, 'green'], [118, 124, 10, 10, 18, 0, 'green']]
};
function makeBoxes(iso, list) {
  iso.textContent = '';
  list.forEach((m, i) => {
    const b = document.createElement('div');
    b.className = 'b' + (m[6] ? ' ' + m[6] : '');
    b.style.cssText = '--x:' + m[0] + 'px;--y:' + m[1] + 'px;--w:' + m[2] + 'px;--d:' + m[3] + 'px;--h:' + m[4] + 'px;--z:' + m[5] + 'px;--i:' + i;
    b.innerHTML = '<i class="t"></i><i class="s1"></i><i class="s2"></i><i class="s3"></i><i class="s4"></i>';
    iso.appendChild(b);
  });
}
$$('.iso[data-model]').forEach(iso => makeBoxes(iso, MODELS[iso.dataset.model] || []));

/* homes: property-type tabs drive the model table */
const tabs = $$('.tab'), homeIso = $('#homeModel');
function selectTab(key, focus) {
  tabs.forEach(t => { const on = t.dataset.key === key; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  $$('.panel').forEach(p => { p.hidden = p.dataset.key !== key; });
  const tab = tabs.find(t => t.dataset.key === key);
  $('#modelName').textContent = tab ? tab.textContent : '';
  makeBoxes(homeIso, HOME_MODELS[key] || []);
  if (!reduceMotion) { homeIso.classList.remove('is-rising'); void homeIso.offsetWidth; homeIso.classList.add('is-rising'); }
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.key));
  t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.key, true);
  });
});
if (homeIso) makeBoxes(homeIso, HOME_MODELS.apartments);
$$('[data-intent]').forEach(a => a.addEventListener('click', () => { const sel = $('#fIntent'); if (sel) sel.value = a.dataset.intent; }));

/* EMI estimate */
const E = { price: $('#ePrice'), down: $('#eDown'), rate: $('#eRate'), years: $('#eYears') };
const inr = v => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v));
const shortInr = v => v >= 1e7
  ? '₹' + (v / 1e7).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + ' Cr'
  : '₹' + (v / 1e5).toFixed(1).replace(/\.0$/, '') + ' L';
function emiCalc() {
  const price = +E.price.value * 1e5, dp = +E.down.value, rate = +E.rate.value, yrs = +E.years.value;
  const P = price * (1 - dp / 100), r = rate / 1200, n = yrs * 12;
  const m = r ? P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : P / n;
  const total = m * n, interest = total - P, pp = P / total * 100;
  $('#oPrice').textContent = shortInr(price);
  $('#oDown').textContent = dp + '% · ' + shortInr(price * dp / 100);
  $('#oRate').textContent = rate.toFixed(2) + '% a year';
  $('#oYears').textContent = yrs + ' years';
  $('#oEmi').firstChild.nodeValue = inr(m);
  $('#oLoan').textContent = inr(P); $('#oInt').textContent = inr(interest); $('#oTotal').textContent = inr(total);
  $('#bP').style.width = pp.toFixed(1) + '%'; $('#bI').style.width = (100 - pp).toFixed(1) + '%';
}
if (E.price) { Object.keys(E).forEach(k => E[k].addEventListener('input', emiCalc)); emiCalc(); }

/* service cards tilt toward the pointer */
if (!reduceMotion && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  $$('.svc').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'perspective(900px) rotateX(' + (-y * 10).toFixed(2) + 'deg) rotateY(' + (x * 12).toFixed(2) + 'deg) translateZ(6px)';
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

/* enquiry form: preview only, nothing is sent */
const form = $('#enquiry'), note = $('#formNote');
form.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#fName').value.trim(), contact = $('#fContact').value.trim();
  note.classList.add('is-shown');
  if (!name || !contact) {
    note.textContent = !name ? 'Add your name so we know who to reply to.' : 'Add an email address or phone number so we can reply.';
    (!name ? $('#fName') : $('#fContact')).focus();
    return;
  }
  note.textContent = 'Thanks, ' + name + '. This page is a preview, so the form is not connected to an inbox yet and nothing was sent.';
});

/* scroll story: each section drives its own slice of T */
const steps = $$('.step');
let bounds = [], vh = window.innerHeight, phone = window.innerWidth < 761;
const LINE = () => (phone ? 0.72 : 0.42);
function measure() {
  vh = window.innerHeight; phone = window.innerWidth < 761;
  bounds = steps.map(s => { const r = s.getBoundingClientRect(); return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY }; });
}
function span(i) {
  const b = bounds[i];
  return { start: i === 0 ? b.top + vh * LINE() : b.top, end: i === steps.length - 1 ? b.bottom - vh * 0.75 : b.bottom };
}
function scrollT(y) {
  const line = y + vh * LINE(); let T = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = span(i);
    if (line >= s.start) T = STAGES[i].a + clamp((line - s.start) / Math.max(1, s.end - s.start), 0, 1) * (STAGES[i].b - STAGES[i].a);
  }
  return T;
}
function yForT(T) {
  let i = 0; while (i < STAGES.length - 1 && T > STAGES[i].b) i++;
  const s = span(i), u = (T - STAGES[i].a) / (STAGES[i].b - STAGES[i].a);
  return Math.max(0, s.start + u * (s.end - s.start) - vh * LINE());
}

/* site readout */
const ro = { box: $('#readout'), sheet: $('#roSheet'), name: $('#roName'), depth: $('#roDepth'), conc: $('#roConc'), mods: $('#roMods'), height: $('#roHeight') };
const segBars = $$('.ro-steps i');
const fmt = new Intl.NumberFormat('en-IN');
let lastRO = '', roOff = false;
function updateReadout(T) {
  const r = readout(T), st = STAGES[r.stage];
  const key = r.stage + '|' + r.depth.toFixed(1) + '|' + Math.round(r.concrete) + '|' + r.modules + '|' + r.height.toFixed(1) + '|' + T.toFixed(3);
  if (key === lastRO) return; lastRO = key;
  ro.sheet.textContent = st.id; ro.name.textContent = st.name;
  ro.depth.textContent = (r.depth > 0.05 ? '−' : '') + r.depth.toFixed(1) + ' m';
  ro.conc.textContent = fmt.format(Math.round(r.concrete)) + ' m³';
  ro.mods.textContent = String(r.modules);
  ro.height.textContent = r.height.toFixed(1) + ' m';
  segBars.forEach((s, i) => s.style.setProperty('--f', stageP(T, i).toFixed(3)));
}

/* timelapse: scrolls the story for you */
let tl = null;
const tlBar = $('#timelapse');
function startTimelapse() {
  measure();
  const end = yForT(1), from = end - window.scrollY < 10 ? 0 : window.scrollY;
  tl = { t0: performance.now(), from, to: end, dur: Math.max(2000, 32000 * (end - from) / Math.max(1, end)) };
  tlBar.hidden = false;
}
function stopTimelapse() { if (!tl) return; tl = null; tlBar.hidden = true; }
function stepTimelapse(now) {
  if (!tl) return;
  const u = clamp((now - tl.t0) / tl.dur, 0, 1);
  window.scrollTo(0, lerp(tl.from, tl.to, u));
  if (u >= 1) stopTimelapse();
}
$('#playBtn').addEventListener('click', startTimelapse);
$('#stopBtn').addEventListener('click', stopTimelapse);
['wheel', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, e => {
  if (tl && !(e.target && e.target.closest && e.target.closest('#timelapse'))) stopTimelapse();
}, { passive: true }));
const smooth = reduceMotion ? 'auto' : 'smooth';
$$('.ro-steps button').forEach(b => b.addEventListener('click', () => {
  stopTimelapse(); measure();
  const i = +b.dataset.go;
  window.scrollTo({ top: yForT(STAGES[i].a + (i ? 0.004 : 0)), behavior: smooth });
}));
$('#againBtn').addEventListener('click', () => { stopTimelapse(); window.scrollTo({ top: 0, behavior: smooth }); });

/* boot the 3D scene; the page still works if it can't start */
const canvas = $('#stage');
let api = null;
try { api = buildScene(canvas); }
catch (err) {
  $('#stageNote').hidden = false;
  canvas.style.background = 'linear-gradient(#bcd3e6, #e6ecee 60%, #c9c1b4)';
  if (window.console) console.warn('3D view unavailable:', err);
}
function onResize() { measure(); if (api) api.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', onResize);
onResize();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
window.addEventListener('load', measure);

let storyOn = true;
if ('IntersectionObserver' in window) new IntersectionObserver(es => { storyOn = es[0].isIntersecting; }).observe($('#build'));
const tStart = performance.now();
let Tcur = scrollT(window.scrollY), prev = tStart;
function frame(now) {
  requestAnimationFrame(frame);
  stepTimelapse(now);
  const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000)); prev = now;
  const Tt = scrollT(window.scrollY);
  Tcur += (Tt - Tcur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 6));
  if (Math.abs(Tt - Tcur) < 1e-5) Tcur = Tt;
  updateReadout(Tcur);
  const off = window.scrollY + vh * 0.55 > bounds[bounds.length - 1].bottom;
  if (off !== roOff) { roOff = off; ro.box.classList.toggle('is-off', off); }
  if (api && storyOn) {
    try { api.update(Tcur, (now - tStart) / 1000, dt); }
    catch (err) {
      api = null; $('#stageNote').hidden = false;
      if (window.console) console.warn('3D view stopped:', err);
    }
  }
}
requestAnimationFrame(frame);
})();
