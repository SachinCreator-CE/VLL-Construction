(function () {
'use strict';
/* ---------- helpers ---------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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

/* ---------- chapters (T runs 0..1 across the scroll story) ---------- */
const STAGES = [
  { name: 'The plot', a: 0.00, b: 0.06 },
  { name: 'The ground', a: 0.06, b: 0.24 },
  { name: 'The foundation', a: 0.24, b: 0.38 },
  { name: 'The structure', a: 0.38, b: 0.72 },
  { name: 'The facade', a: 0.72, b: 0.85 },
  { name: 'The skyline', a: 0.85, b: 1.00 },
];
const stageP = (T, i) => seg(T, STAGES[i].a, STAGES[i].b);

/* ---------- the model: plan unit = 3 m, storey = 3.5 m ---------- */
const PLOT = 14, PIT = 6, PIT_DEPTH = 3;
const LEVELS = 38;                                   // B2, B1, G, then 1..35
const tierOf = lv => (lv < 24 ? 6 : lv < 32 ? 4 : 2);
const levelName = lv => (lv < 0 ? '–' : lv === 0 ? 'B2' : lv === 1 ? 'B1' : lv === 2 ? 'G' : String(lv - 2));

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
const FLIGHT = 9, SLAB_LAG = 5;

// the pit: 6 x 6 cells, 3 layers, lifted out in a diagonal sweep, layer by layer
const DIG = [];
for (let l = 0; l < PIT_DEPTH; l++) for (let i = 0; i < PIT; i++) for (let j = 0; j < PIT; j++) {
  const x = i - (PIT - 1) / 2, z = j - (PIT - 1) / 2;
  DIG.push({ x, y: -0.5 - l, z, l, key: l * 100 + (x + z + 6) * 6 + x });
}
DIG.sort((p, q) => p.key - q.key);
const ND = DIG.length;                               // 108
const DIG_W = 0.14;

function phases(T) {
  const s1 = stageP(T, 1), s2 = stageP(T, 2), s3 = stageP(T, 3), s4 = stageP(T, 4), s5 = stageP(T, 5);
  return {
    survey: stageP(T, 0), dig: seg(s1, 0.06, 0.94),
    piles: seg(s2, 0, 0.32), rebar: seg(s2, 0.3, 0.58), pour: seg(s2, 0.56, 0.94), found: s2,
    craneUp: seg(s3, 0, 0.06), frame: seg(s3, 0.04, 0.98),
    facade: seg(s4, 0, 0.7), craneDown: seg(s4, 0.58, 0.9), spire: seg(s4, 0.72, 1),
    tidy: seg(s5, 0, 0.18), lots: seg(s5, 0.04, 0.42), grow: seg(s5, 0.14, 0.62), sky: s5
  };
}
const buildProgress = p => p.frame * (NB + FLIGHT + SLAB_LAG);
const blocksDone = p => clamp(Math.floor(buildProgress(p) - FLIGHT) + 1, 0, NB);
function topLevelDone(done) { let top = -1; for (let lv = 0; lv < LEVELS; lv++) if (LEVEL_END[lv] < done) top = lv; return top; }

function readout(T) {
  const p = phases(T);
  let dug = 0;
  for (let k = 0; k < ND; k++) if (p.dig >= k / ND * (1 - DIG_W) + DIG_W) dug++;
  const top = topLevelDone(blocksDone(p));
  return {
    stage: STAGES.reduce((acc, s, i) => (T >= s.a - 1e-6 ? i : acc), 0),
    depth: dug / ND * 10.5,
    level: levelName(top),
    height: (Math.max(0, top - 1) + p.spire * 6) * 3.5
  };
}

/* ---------- light and camera, keyed on T (colours are sRGB) ---------- */
const SKY = [
  { t: 0.00, top: 0x0c1422, mid: 0x3a4659, bot: 0x0a0c11, el: 7, az: 118, sun: 0xffb27a, sunI: 0.8, hemi: 0.42, env: 0.5, night: 0.3 },
  { t: 0.16, top: 0x1b2a41, mid: 0xbf8f6b, bot: 0x121419, el: 11, az: 128, sun: 0xffc792, sunI: 1.35, hemi: 0.48, env: 0.6, night: 0 },
  { t: 0.40, top: 0x3c5676, mid: 0xc9baa4, bot: 0x17191d, el: 34, az: 158, sun: 0xfff2e0, sunI: 1.55, hemi: 0.55, env: 0.7, night: 0 },
  { t: 0.72, top: 0x34476b, mid: 0xdaa777, bot: 0x16171b, el: 15, az: 218, sun: 0xffc488, sunI: 1.45, hemi: 0.48, env: 0.62, night: 0 },
  { t: 0.88, top: 0x151b31, mid: 0x7d5046, bot: 0x0d0e13, el: 2, az: 240, sun: 0xff9160, sunI: 0.45, hemi: 0.26, env: 0.32, night: 0.62 },
  { t: 1.00, top: 0x04060b, mid: 0x121826, bot: 0x06070a, el: 34, az: 250, sun: 0x93a6d4, sunI: 0.3, hemi: 0.13, env: 0.15, night: 1 }
];
const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
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
  { t: 0.00, ty: 15, r: 82, el: 11, az: 30 },
  { t: 0.06, ty: 4, r: 46, el: 24, az: 40 },
  { t: 0.16, ty: -1.0, r: 28, el: 40, az: 56 },
  { t: 0.30, ty: -2.0, r: 25, el: 50, az: 74 },
  { t: 0.40, ty: 3, r: 35, el: 22, az: 96 },
  { t: 0.56, ty: 12, r: 54, el: 14, az: 122 },
  { t: 0.72, ty: 20, r: 72, el: 10, az: 146 },
  { t: 0.80, ty: 27, r: 58, el: 6, az: 168 },
  { t: 0.87, ty: 24, r: 82, el: 9, az: 188 },
  { t: 1.00, ty: 16, r: 152, el: 15, az: 218 }
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
  renderer.outputEncoding = T3.sRGBEncoding;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;

  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(30, 1, 0.5, 1600);
  const rand = rng(20261121);
  const DEG = Math.PI / 180;
  const lin = h => new T3.Color(h).convertSRGBToLinear();
  const mats = [];
  const std = (hexColor, o) => { const m = new T3.MeshStandardMaterial(Object.assign({ color: lin(hexColor), roughness: 0.85, metalness: 0 }, o || {})); mats.push(m); return m; };
  const _m = new T3.Matrix4(), _q = new T3.Quaternion(), _p = new T3.Vector3(), _s = new T3.Vector3(), _e = new T3.Euler(), _c = new T3.Color();
  const linC = h => _c.setHex(h).convertSRGBToLinear();
  const TINY = 1e-4;
  function setI(mesh, i, x, y, z, sx, sy, sz, ry) {
    _p.set(x, y, z); _s.set(sx, sy, sz);
    if (ry) { _e.set(0, ry, 0); _q.setFromEuler(_e); } else _q.set(0, 0, 0, 1);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  const hideI = (mesh, i) => setI(mesh, i, 0, -60, 0, TINY, TINY, TINY);
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
  function canvasTex(w, h, draw, srgb) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 4;
    if (srgb !== false) t.encoding = T3.sRGBEncoding;
    return t;
  }
  const setScale = (o, s) => { const v = Math.max(TINY, s); o.scale.set(v, v, v); o.visible = s > 0.002; };
  const glowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const glow = (hexColor, size) => {
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: lin(hexColor), transparent: true, blending: T3.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); scene.add(s); return s;
  };

  /* ---- sky dome, stars, environment ---- */
  const skyU = { top: { value: new T3.Color() }, mid: { value: new T3.Color() }, bot: { value: new T3.Color() },
    sunDir: { value: new T3.Vector3(0, 1, 0) }, sunCol: { value: new T3.Color() }, glow: { value: 1 } };
  const sky = new T3.Mesh(new T3.SphereGeometry(1000, 32, 16), new T3.ShaderMaterial({
    uniforms: skyU, side: T3.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;\n' +
      'void main(){ vec3 d = normalize(vDir); float y = d.y;\n' +
      ' vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y, 0.0, 1.0), 0.5)) : mix(mid, bot, clamp(-y * 6.0, 0.0, 1.0));\n' +
      ' float s = max(dot(d, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 700.0) * 2.0) * glow;\n' +
      ' gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  const STARS = 1100, starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const u = rand() * Math.PI * 2, v = 0.05 + rand() * 0.95, r = 800, y = v * v, rr = Math.sqrt(1 - y * y);
    starPos[i * 3] = Math.cos(u) * rr * r; starPos[i * 3 + 1] = y * r; starPos[i * 3 + 2] = Math.sin(u) * rr * r;
  }
  const starGeo = new T3.BufferGeometry(); starGeo.setAttribute('position', new T3.BufferAttribute(starPos, 3));
  const starMat = new T3.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new T3.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

  (function makeEnv() {
    const g = new T3.SphereGeometry(10, 32, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const top = lin(0x3b4c66), hor = lin(0xdcc9ad), gnd = lin(0x27252a), tc = new T3.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y > 0) tc.copy(hor).lerp(top, Math.pow(y, 0.55)); else tc.copy(hor).lerp(gnd, Math.min(1, -y * 5));
      col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
    }
    g.setAttribute('color', new T3.BufferAttribute(col, 3));
    const es = new T3.Scene();
    es.add(new T3.Mesh(g, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
    const disc = new T3.Mesh(new T3.SphereGeometry(1.1, 16, 8), new T3.MeshBasicMaterial({ color: new T3.Color(4.0, 3.1, 2.2) }));
    disc.position.set(-6, 3.5, 5); es.add(disc);
    const strip = new T3.Mesh(new T3.BoxGeometry(14, 0.6, 0.6), new T3.MeshBasicMaterial({ color: new T3.Color(1.6, 1.5, 1.4) }));
    strip.position.set(0, 7, -6); es.add(strip);
    const pm = new T3.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  })();

  /* ---- lights ---- */
  const hemi = new T3.HemisphereLight(0xffffff, 0x2a2622, 0.5); scene.add(hemi);
  const sun = new T3.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 360;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new T3.Fog(0x000000, 80, 300);

  /* ---- materials ---- */
  const mBrass = std(0xc8a46b, { metalness: 1, roughness: 0.32 }); mBrass.userData.envBoost = 1.4;
  const mBronze = std(0x7d5f3c, { metalness: 0.9, roughness: 0.38 }); mBronze.userData.envBoost = 1.3;
  const mGraphite = std(0x2a2c31, { roughness: 0.55, metalness: 0.2 });
  const mStone = std(0x1b1b1d, { roughness: 0.6 });
  const mWhite = std(0xe9e5dd, { roughness: 0.55 });
  const mConc = std(0xc9c4ba, { roughness: 0.75 });
  const mLawn = std(0x34472e, { roughness: 1 });
  const mSteel = std(0x9a9893, { roughness: 0.45, metalness: 0.4 });

  /* ---- the plinth: a sectional model of the ground ---- */
  const STRATA = [0x4a392a, 0x6d4f37, 0x9a8060, 0x5c5852, 0x33312e];
  const strataMat = STRATA.map(h => std(h, { roughness: 0.95 }));
  box(14.8, 0.5, 14.8, mStone, 0, -5.25, 0);
  for (let l = 0; l < 3; l++) {
    const y = -0.5 - l, m = strataMat[l];
    box(14, 1, 4, m, 0, y, 5); box(14, 1, 4, m, 0, y, -5); box(4, 1, 6, m, -5, y, 0); box(4, 1, 6, m, 5, y, 0);
  }
  box(14, 1, 14, strataMat[3], 0, -3.5, 0); box(14, 1, 14, strataMat[4], 0, -4.5, 0);
  const lawn = new T3.Group(); scene.add(lawn);
  box(14, 0.05, 4, mLawn, 0, 0.025, 5, lawn); box(14, 0.05, 4, mLawn, 0, 0.025, -5, lawn);
  box(4, 0.05, 6, mLawn, -5, 0.025, 0, lawn); box(4, 0.05, 6, mLawn, 5, 0.025, 0, lawn);
  const cells = inst(new T3.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.95 }), ND);
  DIG.forEach((d, k) => { setI(cells, k, d.x, d.y, d.z, 1, 1, 1); cells.setColorAt(k, linC(STRATA[d.l]).multiplyScalar(0.94 + rand() * 0.1)); });
  cells.instanceColor.needsUpdate = true;

  const softTex = glowTex;
  const DUST = 70, dustPos = new Float32Array(DUST * 3), dustSeed = [];
  for (let i = 0; i < DUST; i++) dustSeed.push([rand() * 6 - 3, rand() * 6 - 3, rand(), 0.6 + rand() * 0.8]);
  const dustGeo = new T3.BufferGeometry(); dustGeo.setAttribute('position', new T3.BufferAttribute(dustPos, 3));
  const dust = new T3.Points(dustGeo, new T3.PointsMaterial({ color: lin(0xd9c3a0), size: 0.5, map: softTex, transparent: true, opacity: 0, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);

  /* ---- survey: brass pins, laser lines, the blueprint of the tower ---- */
  const pinGeo = new T3.CylinderGeometry(0.035, 0.035, 0.9, 10); pinGeo.translate(0, 0.45, 0);
  const PINS = [[-3.25, -3.25], [0, -3.25], [3.25, -3.25], [3.25, 0], [3.25, 3.25], [0, 3.25], [-3.25, 3.25], [-3.25, 0]];
  const pins = inst(pinGeo, mBrass, PINS.length);
  PINS.forEach((_, i) => hideI(pins, i));
  const lzPos = [];
  for (let i = 0; i < 8; i++) { const a = PINS[i], b = PINS[(i + 1) % 8]; lzPos.push(a[0], 0.62, a[1], b[0], 0.62, b[1]); }
  [-3.25, 3.25].forEach(v => { lzPos.push(v, 0.62, -14, v, 0.62, 14, -14, 0.62, v, 14, 0.62, v); });
  const lzGeo = new T3.BufferGeometry(); lzGeo.setAttribute('position', new T3.Float32BufferAttribute(lzPos, 3));
  const lasers = new T3.LineSegments(lzGeo, new T3.LineBasicMaterial({ color: lin(0xffbf72), transparent: true, opacity: 0.9, blending: T3.AdditiveBlending, depthWrite: false }));
  scene.add(lasers);
  const LZ_SEGS = lzPos.length / 6;

  const gPos = [];
  const rect = (y, n) => { const h = n / 2, c = [[-h, -h], [h, -h], [h, h], [-h, h]]; for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; gPos.push(a[0], y, a[1], b[0], y, b[1]); } };
  const verts = (y0, y1, n) => { const h = n / 2; [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([x, z]) => gPos.push(x, y0, z, x, y1, z)); };
  verts(-2, 22, 6); verts(22, 30, 4); verts(30, 36, 2);
  for (let lv = 0; lv <= LEVELS; lv++) rect(lv - 2, tierOf(Math.min(lv, LEVELS - 1)));
  rect(22, 6); rect(30, 4); rect(37.6, 2.3);
  gPos.push(0, 37.6, 0, 0, 42, 0);
  const ghostGeo = new T3.BufferGeometry(); ghostGeo.setAttribute('position', new T3.Float32BufferAttribute(gPos, 3));
  const ghostMat = new T3.LineDashedMaterial({ color: lin(0xeadbc0), dashSize: 0.3, gapSize: 0.24, transparent: true, opacity: 0.6, depthWrite: false });
  const ghost = new T3.LineSegments(ghostGeo, ghostMat); ghost.computeLineDistances(); scene.add(ghost);
  const GHOST_SEGS = gPos.length / 6;

  /* ---- foundation: piles, rebar mats, raft ---- */
  const pileGeo = new T3.CylinderGeometry(0.2, 0.2, 2.3, 14); pileGeo.translate(0, -1.15, 0);
  const piles = inst(pileGeo, std(0xa29e96, { roughness: 0.6, metalness: 0.15 }), 16);
  const PILE_XZ = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) PILE_XZ.push([-2.25 + i * 1.5, -2.25 + (i % 2 ? 3 - j : j) * 1.5]);
  PILE_XZ.forEach((_, i) => hideI(piles, i));
  const rbPos = [];
  [-2.78, -2.32].forEach(y => {
    for (let i = 0; i < 20; i++) { const v = -2.85 + i * 0.3; rbPos.push(v, y, -2.95, v, y, 2.95); }
    for (let i = 0; i < 20; i++) { const v = -2.85 + i * 0.3; rbPos.push(-2.95, y, v, 2.95, y, v); }
  });
  const rbGeo = new T3.BufferGeometry(); rbGeo.setAttribute('position', new T3.Float32BufferAttribute(rbPos, 3));
  const rebar = new T3.LineSegments(rbGeo, new T3.LineBasicMaterial({ color: lin(0xc07a44) })); scene.add(rebar);
  const RB_SEGS = rbPos.length / 6;
  const raftGeo = new T3.BoxGeometry(5.99, 1, 5.99); raftGeo.translate(0, 0.5, 0);
  const raftMat = std(0x5e6063, { roughness: 0.25 });
  const raft = new T3.Mesh(raftGeo, raftMat); raft.position.set(0, -3, 0); raft.castShadow = raft.receiveShadow = true; scene.add(raft);
  const WET = lin(0x55575a), CURED = lin(0xc6c1b7);

  /* ---- the tower: stone modules and slab edges ---- */
  const blocks = inst(new T3.BoxGeometry(0.97, 0.97, 0.97), std(0xffffff, { roughness: 0.7 }), NB);
  BLOCKS.forEach((b, i) => {
    blocks.setColorAt(i, linC(b.core ? 0xb9b4aa : b.lv < 2 ? 0xa9a49b : 0xd8d3c9).multiplyScalar(0.96 + rand() * 0.06)); hideI(blocks, i);
  });
  blocks.instanceColor.needsUpdate = true;
  const slabs = inst(new T3.BoxGeometry(1, 0.12, 1), mWhite, LEVELS);
  for (let lv = 0; lv < LEVELS; lv++) hideI(slabs, lv);

  /* ---- climbing tower crane, in white ---- */
  const lattice = canvasTex(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w); g.strokeStyle = '#e9e6df'; g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, w - 6); g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(3, 3); g.lineTo(w - 3, w - 3); g.moveTo(w - 3, 3); g.lineTo(3, w - 3); g.stroke();
  });
  const latMat = (rx, ry) => { const t = lattice.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return std(0xffffff, { map: t, alphaTest: 0.5, side: T3.DoubleSide, roughness: 0.5 }); };
  const CRANE = new T3.Vector3(5.4, 0, -5.4);
  const crane = new T3.Group(); crane.position.copy(CRANE); scene.add(crane);
  box(1.4, 0.4, 1.4, mGraphite, 0, 0.2, 0, crane);
  const mastGeo = new T3.BoxGeometry(0.66, 1, 0.66); mastGeo.translate(0, 0.5, 0);
  const mastMat = latMat(1, 10);
  const mast = new T3.Mesh(mastGeo, mastMat); mast.position.y = 0.4; mast.castShadow = true; crane.add(mast);
  const head = new T3.Group(); crane.add(head);
  const jibGeo = new T3.BoxGeometry(13, 0.5, 0.5); jibGeo.translate(6.2, 0, 0);
  const jib = new T3.Mesh(jibGeo, latMat(26, 1)); jib.castShadow = true; head.add(jib);
  const cjGeo = new T3.BoxGeometry(4.4, 0.46, 0.5); cjGeo.translate(-2.2, 0, 0);
  const cjib = new T3.Mesh(cjGeo, latMat(9, 1)); cjib.castShadow = true; head.add(cjib);
  box(0.9, 0.8, 0.9, mGraphite, -3.7, -0.55, 0, head); box(0.9, 0.8, 0.9, mGraphite, -2.7, -0.55, 0, head);
  const apexGeo = new T3.BoxGeometry(0.42, 2.6, 0.42); apexGeo.translate(0, 1.3, 0);
  const apex = new T3.Mesh(apexGeo, latMat(1, 6)); apex.castShadow = true; head.add(apex);
  box(0.66, 0.6, 0.6, mGraphite, 0.55, -0.55, 0.6, head);
  const tieGeo = new T3.BufferGeometry(); tieGeo.setAttribute('position', new T3.Float32BufferAttribute([0, 2.6, 0, 8.5, 0.25, 0, 0, 2.6, 0, -4.3, 0.25, 0], 3));
  head.add(new T3.LineSegments(tieGeo, new T3.LineBasicMaterial({ color: lin(0xb9b6ae) })));
  const trolley = box(0.5, 0.16, 0.56, mGraphite, 6, -0.33, 0, head);
  const cableGeo = new T3.BoxGeometry(0.03, 1, 0.03); cableGeo.translate(0, -0.5, 0);
  const cable = new T3.Mesh(cableGeo, mGraphite); head.add(cable);
  const hook = box(0.3, 0.3, 0.22, mBrass, 6, -2, 0, head);
  const load = box(0.97, 0.97, 0.97, std(0xd8d3c9, { roughness: 0.7 }), 6, -2.7, 0, head);
  load.scale.setScalar(0.85);
  const craneLight = glow(0xff3b2f, 1.6);
  const crs = { ang: 2.36, dist: 7, mast: 9, hookY: 6 };

  /* ---- envelope: tinted glass, bronze fins, warm interiors ---- */
  const glassTex = canvasTex(128, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b9c2c6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(20,22,26,.85)'; g.fillRect(0, Math.round(h * 0.7), w, 2);
  });
  const glass = {}, panelsOf = {};
  [6, 4, 2].forEach(n => {
    const t = glassTex.clone(); t.needsUpdate = true; t.repeat.set(n, 1);
    const m = std(0x4d5a61, { map: t, metalness: 0.92, roughness: 0.07 }); m.userData.envBoost = 1.7;
    const list = [];
    for (let lv = 2; lv < LEVELS; lv++) if (tierOf(lv) === n) for (let s = 0; s < 4; s++) list.push({ lv, s });
    glass[n] = inst(new T3.BoxGeometry(n, 0.86, 0.04), m, list.length);
    panelsOf[n] = list; list.forEach((_, i) => hideI(glass[n], i));
  });
  const FINS = [];
  for (let lv = 2; lv < LEVELS; lv++) { const n = tierOf(lv); for (let s = 0; s < 4; s++) for (let k = 0; k <= n; k++) FINS.push({ lv, s, n, off: k - n / 2 }); }
  const fins = inst(new T3.BoxGeometry(0.05, 0.98, 0.24), mBronze, FINS.length);
  FINS.forEach((_, i) => hideI(fins, i));
  const LIT = [], warm = [0xffc77d, 0xffd59a, 0xffe2b8, 0xffb866, 0xf3e6cf];
  for (let lv = 2; lv < LEVELS; lv++) {
    const n = tierOf(lv);
    for (let s = 0; s < 4; s++) for (let b = 0; b < n; b++) if (rand() < 0.66) LIT.push({ lv, s, off: b - (n - 1) / 2, n, r: rand(), col: warm[Math.floor(rand() * warm.length)] });
  }
  const lit = inst(new T3.PlaneGeometry(0.86, 0.7), new T3.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false }), LIT.length, false);
  LIT.forEach((w, i) => { lit.setColorAt(i, linC(w.col)); hideI(lit, i); });
  lit.instanceColor.needsUpdate = true;

  // sky gardens on the setback terraces
  const GARDEN = [];
  [[22, 6, 4], [30, 4, 2]].forEach(([y, outer, inner]) => {
    const mid = (outer + inner) / 4 + 0.08, len = outer - 0.5;
    for (let s = 0; s < 4; s++) GARDEN.push({ y, s, mid, len });
  });
  const planters = inst(new T3.BoxGeometry(1, 1, 1), std(0x2f3d2a, { roughness: 1 }), GARDEN.length);
  GARDEN.forEach((_, i) => hideI(planters, i));

  // crown lantern, spire and aviation light
  const lanternMat = std(0x3a3f44, { metalness: 0.6, roughness: 0.2, emissive: lin(0xffc27a), emissiveIntensity: 0 });
  const lantern = box(2.25, 1.6, 2.25, lanternMat, 0, 36.8, 0);
  const spireGeo = new T3.CylinderGeometry(0.025, 0.15, 4.4, 10); spireGeo.translate(0, 2.2, 0);
  const spire = new T3.Mesh(spireGeo, mBronze); spire.position.y = 37.6; spire.castShadow = true; scene.add(spire);
  const crownGlow = glow(0xffc27a, 9);
  crownGlow.position.set(0, 36.9, 0);
  const beacon = glow(0xff3b2f, 1.8);

  /* ---- handover: plaza, reflecting pool, trees ---- */
  const plaza = new T3.Mesh(new T3.BoxGeometry(10.6, 0.06, 10.6), std(0xd2c5ab, { roughness: 0.8 }));
  plaza.position.y = 0.06; plaza.receiveShadow = true; scene.add(plaza);
  const pool = new T3.Mesh(new T3.BoxGeometry(6.4, 0.04, 1.3), std(0x0e1418, { metalness: 1, roughness: 0.04 }));
  pool.position.set(0, 0.11, 4.45); pool.material.userData.envBoost = 1.8; scene.add(pool);
  const TREES = [];
  for (let i = 0; i < 6; i++) { const v = -5.6 + i * 2.24; TREES.push([v, -6.2, 0], [-6.2, v, 0], [6.2, v, 0]); }
  [-5.6, -3.4, 3.4, 5.6].forEach(v => TREES.push([v, 6.2, 0]));

  /* ---- the city that rises around it ---- */
  const LOTS = [], PIECES = [], CITY_LIGHTS = [];
  const facades = [0x2b2e33, 0x34373d, 0x3c3e43, 0x25282d, 0x2c3a45, 0x3b3631, 0x41454b];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (!i && !j) continue;
    const ring = Math.max(Math.abs(i), Math.abs(j)), park = rand() < 0.14;
    const lot = { x: i * 16, z: j * 16, ring, park, d: (ring - 1) * 0.24 + rand() * 0.14 };
    LOTS.push(lot);
    for (let t = 0; t < (park ? 7 : 2); t++) TREES.push([lot.x + (rand() - 0.5) * 12, lot.z + (rand() - 0.5) * 12, 1, lot]);
    if (park) continue;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      if (rand() < 0.26) continue;
      const w = 3 + rand() * 3, dd = 3 + rand() * 3;
      let h = (3 + Math.pow(rand(), 1.5) * 22) * (1 - 0.12 * (ring - 1));
      if (rand() < 0.14) h = 18 + rand() * 12;
      const x = lot.x + (a ? 3.5 : -3.5) + (rand() - 0.5), z = lot.z + (b ? 3.5 : -3.5) + (rand() - 0.5);
      const col = facades[Math.floor(rand() * facades.length)], crown = h > 10 && rand() < 0.4 ? 1.5 + rand() * 3 : 0;
      const bld = { lot, start: lot.d + 0.1 + rand() * 0.25, H: h + crown };
      PIECES.push({ bld, x, z, w, d: dd, y0: 0, h, col });
      if (crown) PIECES.push({ bld, x, z, w: w * 0.62, d: dd * 0.62, y0: h, h: crown, col: 0x1f2226 });
      for (let f = 0; f < 4; f++) {
        const nx = f === 0 ? 1 : f === 1 ? -1 : 0, nz = f === 2 ? 1 : f === 3 ? -1 : 0;
        const span = nx ? dd : w, cols = Math.max(1, Math.floor(span / 0.95));
        for (let yy = 0.7; yy < h - 0.3; yy += 1.05) for (let c = 0; c < cols; c++) {
          if (rand() > 0.32) continue;
          const o = (c + 0.5) / cols * span - span / 2;
          CITY_LIGHTS.push(x + nx * (w / 2 + 0.07) + (nz ? o : 0), yy, z + nz * (dd / 2 + 0.07) + (nx ? o : 0));
        }
      }
    }
  }
  const boxUp = new T3.BoxGeometry(1, 1, 1); boxUp.translate(0, 0.5, 0);
  const lots = inst(new T3.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), std(0xffffff, { roughness: 0.9 }), LOTS.length);
  LOTS.forEach((l, i) => { lots.setColorAt(i, linC(l.park ? 0x24321f : 0x202125).multiplyScalar(0.92 + rand() * 0.12)); hideI(lots, i); });
  lots.instanceColor.needsUpdate = true;
  const city = inst(boxUp, std(0xffffff, { roughness: 0.45, metalness: 0.35 }), PIECES.length);
  PIECES.forEach((p, i) => { city.setColorAt(i, linC(p.col)); hideI(city, i); });
  city.instanceColor.needsUpdate = true;
  const streets = new T3.Mesh(new T3.BoxGeometry(114, 0.6, 114), std(0x121316, { roughness: 0.6, metalness: 0.2 }));
  streets.position.y = -0.4; streets.receiveShadow = true; scene.add(streets);

  const trunkGeo = new T3.CylinderGeometry(0.06, 0.09, 0.8, 6); trunkGeo.translate(0, 0.4, 0);
  const crownGeo = new T3.IcosahedronGeometry(0.6, 1); crownGeo.scale(1, 1.25, 1); crownGeo.translate(0, 1.35, 0);
  const trunks = inst(trunkGeo, std(0x4a3a2c), TREES.length);
  const crowns = inst(crownGeo, std(0xffffff, { roughness: 0.9 }), TREES.length);
  TREES.forEach((t, i) => { crowns.setColorAt(i, linC([0x2f4a2b, 0x3a5532, 0x283f27][i % 3])); hideI(trunks, i); hideI(crowns, i); t.s = 0.8 + rand() * 0.5; t.r = rand(); });
  crowns.instanceColor.needsUpdate = true;

  const cl = new Float32Array(CITY_LIGHTS), clCol = new Float32Array(cl.length);
  for (let i = 0; i < cl.length; i += 3) { linC(rand() < 0.82 ? 0xffd08f : 0xdbe7ff).multiplyScalar(0.7 + rand() * 0.3); clCol[i] = _c.r; clCol[i + 1] = _c.g; clCol[i + 2] = _c.b; }
  const clGeo = new T3.BufferGeometry(); clGeo.setAttribute('position', new T3.BufferAttribute(cl, 3)); clGeo.setAttribute('color', new T3.BufferAttribute(clCol, 3));
  const cityLights = new T3.Points(clGeo, new T3.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T3.AdditiveBlending }));
  cityLights.frustumCulled = false; scene.add(cityLights);

  const CARS = 170, carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3), carData = [];
  for (let i = 0; i < CARS; i++) {
    const axis = rand() < 0.5 ? 0 : 1, dir = rand() < 0.5 ? 1 : -1, line = 8 + (Math.floor(rand() * 8) - 4) * 16;
    carData.push({ axis, dir, c: line + dir * 0.45, ph: rand() * 112, v: 5 + rand() * 5 });
    linC(dir > 0 ? 0xfff0cf : 0xff4a36); carCol[i * 3] = _c.r; carCol[i * 3 + 1] = _c.g; carCol[i * 3 + 2] = _c.b;
  }
  const carGeo = new T3.BufferGeometry(); carGeo.setAttribute('position', new T3.BufferAttribute(carPos, 3)); carGeo.setAttribute('color', new T3.BufferAttribute(carCol, 3));
  const cars = new T3.Points(carGeo, new T3.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T3.AdditiveBlending }));
  cars.frustumCulled = false; scene.add(cars);

  /* ---- per-frame update: a function of T (the scroll) plus a little ambient time ---- */
  const last = {};
  const changed = (k, v) => { if (last[k] === v) return false; last[k] = v; return true; };
  const camT = new T3.Vector3(), sunDir = new T3.Vector3();
  let fit = 1, lastLots = 0;
  const lotU = l => clamp(lastLots * 1.7 - l.d, 0, 1);
  const lotY = l => lerp(-26, 0, easeOut(lotU(l)));

  function update(T, time, dt) {
    const p = phases(T), s = skyAt(T), c = camAt(T), night = s.night;
    const amb = reduceMotion ? 0 : 1;
    const intro = reduceMotion ? 1 : clamp((time - 0.3) / 3.2, 0, 1);
    const dolly = reduceMotion ? 1 : easeOut(clamp(time / 4.2, 0, 1));
    lastLots = p.lots;

    // camera: a slow orbit, with a dolly-in when the page opens
    const az = (c.az + Math.sin(time * 0.11) * 2 * amb - (1 - dolly) * 14) * DEG;
    const el = (c.el + Math.sin(time * 0.08) * 0.7 * amb + (1 - dolly) * 5) * DEG;
    const r = c.r * fit * lerp(1.3, 1, dolly);
    camera.position.set(Math.cos(el) * Math.sin(az) * r, c.ty + Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
    camT.set(0, c.ty, 0); camera.lookAt(camT);
    sky.position.copy(camera.position); stars.position.copy(camera.position);

    // sky, sun, fog
    skyU.top.value.setRGB(s.top[0], s.top[1], s.top[2]).convertSRGBToLinear();
    skyU.mid.value.setRGB(s.mid[0], s.mid[1], s.mid[2]).convertSRGBToLinear();
    skyU.bot.value.setRGB(s.bot[0], s.bot[1], s.bot[2]).convertSRGBToLinear();
    skyU.sunCol.value.setRGB(s.sun[0], s.sun[1], s.sun[2]).convertSRGBToLinear();
    const se = s.el * DEG, sa = s.az * DEG;
    sunDir.set(Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa));
    skyU.sunDir.value.copy(sunDir); skyU.glow.value = 1 - night;
    starMat.opacity = Math.pow(night, 1.4) * 0.9; stars.visible = starMat.opacity > 0.01;
    scene.fog.color.copy(skyU.mid.value); scene.fog.near = r * 0.85; scene.fog.far = r * 3.4;
    hemi.intensity = s.hemi;
    hemi.color.copy(skyU.top.value).lerp(_c.setRGB(1, 1, 1), 0.55);
    hemi.groundColor.setRGB(0.09, 0.08, 0.07);
    sun.color.copy(skyU.sunCol.value); sun.intensity = s.sunI;
    sun.position.copy(sunDir).multiplyScalar(170); sun.target.position.set(0, 0, 0);
    const S = Math.round(lerp(13, 72, ease(seg(T, 0.36, 1))));
    if (changed('S', S)) { const sc = sun.shadow.camera; sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); }
    for (let i = 0; i < mats.length; i++) mats[i].envMapIntensity = s.env * (mats[i].userData.envBoost || 1);

    // survey: pins rise, lasers set out the grid, the tower is traced upward
    const sv = Math.max(p.survey, intro), gone = seg(p.found, 0, 0.12);
    if (changed('stk', sv + gone * 10)) {
      PINS.forEach((st, i) => {
        const u = seg(sv, i * 0.05, i * 0.05 + 0.3), sc = u > 0 ? easeOut(u) * (1 - gone) : 0;
        if (sc <= 0.001) hideI(pins, i); else setI(pins, i, st[0], 0, st[1], 1, sc, 1);
      });
      pins.instanceMatrix.needsUpdate = true;
      lasers.geometry.setDrawRange(0, Math.floor(seg(sv, 0.25, 0.75) * LZ_SEGS) * 2);
      ghost.geometry.setDrawRange(0, Math.floor(seg(sv, 0.2, 1) * GHOST_SEGS) * 2);
    }
    lasers.material.opacity = 0.9 * (1 - gone) * (0.75 + 0.25 * Math.sin(time * 2.2) * amb);
    lasers.visible = gone < 1;
    ghostMat.opacity = 0.62 * (1 - 0.6 * p.frame) * (1 - p.facade);
    ghost.visible = ghostMat.opacity > 0.01;

    // the ground: layers lift out of the pit and dissolve
    if (changed('dig', p.dig)) {
      DIG.forEach((d, k) => {
        const u = clamp((p.dig - k / ND * (1 - DIG_W)) / DIG_W, 0, 1);
        if (u <= 0) setI(cells, k, d.x, d.y, d.z, 1, 1, 1);
        else if (u >= 1) hideI(cells, k);
        else {
          const sc = Math.max(TINY, 1 - ease(seg(u, 0.3, 1)));
          setI(cells, k, d.x, d.y + easeInOut(u) * 4.2, d.z, sc, sc, sc, u * 1.3);
        }
      });
      cells.instanceMatrix.needsUpdate = true;
    }
    const digging = p.dig > 0 && p.dig < 1, drilling = p.piles > 0 && p.piles < 1;
    const dustOn = (digging ? 0.32 : 0) + (drilling ? 0.2 : 0);
    dust.material.opacity = dustOn; dust.visible = dustOn > 0;
    if (dustOn > 0) {
      const floorY = -3 * p.dig;
      for (let i = 0; i < DUST; i++) {
        const d = dustSeed[i], life = (time * 0.3 * d[3] + d[2]) % 1;
        dustPos[i * 3] = d[0] + Math.sin(time * 0.4 + i) * 0.3; dustPos[i * 3 + 1] = floorY + life * 3.6; dustPos[i * 3 + 2] = d[1];
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // foundation
    if (changed('pile', p.piles)) {
      PILE_XZ.forEach((xz, i) => {
        const u = seg(p.piles, i / 16 * 0.72, i / 16 * 0.72 + 0.28);
        if (u <= 0) hideI(piles, i); else setI(piles, i, xz[0], lerp(10, -2.7, easeInOut(u)), xz[1], 1, 1, 1);
      });
      piles.instanceMatrix.needsUpdate = true;
    }
    rebar.geometry.setDrawRange(0, Math.floor(p.rebar * RB_SEGS) * 2); rebar.visible = p.rebar > 0;
    raft.scale.y = Math.max(TINY, p.pour); raft.visible = p.pour > 0;
    const cure = seg(T, 0.37, 0.46);
    raftMat.color.copy(WET).lerp(CURED, cure); raftMat.roughness = lerp(0.18, 0.78, cure);

    // structure: modules lowered into place, slab edges close each level
    const prog = buildProgress(p);
    if (changed('prog', prog)) {
      for (let k = 0; k < NB; k++) {
        const b = BLOCKS[k], u = clamp((prog - k) / FLIGHT, 0, 1);
        if (u <= 0) { hideI(blocks, k); continue; }
        if (u >= 1) { setI(blocks, k, b.x, b.y, b.z, 1, 1, 1); continue; }
        const e = easeOut(u), sc = lerp(0.9, 1, e);
        setI(blocks, k, b.x, b.y + 2.4 * (1 - e), b.z, sc, sc, sc);
      }
      blocks.instanceMatrix.needsUpdate = true;
      for (let lv = 0; lv < LEVELS; lv++) {
        const su = clamp((prog - LEVEL_END[lv] - FLIGHT) / SLAB_LAG, 0, 1), n = (tierOf(lv) + 0.36) * easeOut(su);
        if (su <= 0) hideI(slabs, lv); else setI(slabs, lv, 0, lv - 1, 0, n, 1, n);
      }
      slabs.instanceMatrix.needsUpdate = true;
    }

    // crane climbs with the building and swings to the next module
    const top = topLevelDone(blocksDone(p)), builtTop = top >= 0 ? top - 1 : -2;
    crs.mast += (Math.max(9, builtTop + 6) - crs.mast) * Math.min(1, dt * 4);
    const mastH = crs.mast * easeOut(p.craneUp) * (1 - ease(seg(p.craneDown, 0.35, 1)));
    crane.visible = p.craneUp > 0 && p.craneDown < 1;
    craneLight.visible = false;
    if (crane.visible) {
      mast.scale.y = Math.max(TINY, mastH); mastMat.map.repeat.set(1, Math.max(1, mastH / 0.66));
      const headY = 0.4 + mastH, hs = ease(seg(p.craneUp, 0.5, 1)) * (1 - ease(seg(p.craneDown, 0, 0.4)));
      head.position.y = headY; setScale(head, hs);
      const working = p.frame > 0 && p.frame < 1, tb = BLOCKS[clamp(Math.floor(prog), 0, NB - 1)];
      let tx = tb.x - CRANE.x, tz = tb.z - CRANE.z, ty = tb.y + 2.4;
      if (!working) { tx = -7; tz = 7; ty = headY - 3; }
      const tA = Math.atan2(-tz, tx), tD = clamp(Math.hypot(tx, tz), 1.6, 12.4);
      const dA = ((tA - crs.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI, k = Math.min(1, dt * 4);
      crs.ang += dA * k; crs.dist += (tD - crs.dist) * k; crs.hookY += (ty - crs.hookY) * k;
      head.rotation.y = crs.ang + Math.sin(time * 0.6) * 0.015 * amb;
      const hl = Math.min(-0.9, crs.hookY - headY);
      trolley.position.x = cable.position.x = hook.position.x = load.position.x = crs.dist;
      cable.position.y = -0.4; cable.scale.y = Math.max(TINY, -hl - 0.4);
      hook.position.y = hl; load.position.y = hl - 0.66; load.visible = working;
      craneLight.position.set(CRANE.x, headY + 2.7 * hs, CRANE.z);
      craneLight.visible = hs > 0.5 && (!amb || Math.sin(time * 2.6) > -0.1);
      craneLight.material.opacity = 0.35 + 0.65 * Math.max(night, 0.25);
    }

    // facade: glass and bronze fins climb the tower, gardens are planted
    const fp = p.facade * (36 + 1.8);
    if (changed('fac', p.facade)) {
      [6, 4, 2].forEach(n => {
        const g = glass[n];
        panelsOf[n].forEach((pn, i) => {
          const u = clamp(fp - (pn.lv - 2) - pn.s * 0.2, 0, 1);
          if (u <= 0) { hideI(g, i); return; }
          const ry = pn.s * Math.PI / 2, d = n / 2 + 0.02, e = easeOut(u);
          setI(g, i, Math.sin(ry) * d, pn.lv - 1.5 - (1 - e) * 1.2, Math.cos(ry) * d, Math.max(TINY, e), 1, 1, ry);
        });
        g.instanceMatrix.needsUpdate = true;
      });
      FINS.forEach((f, i) => {
        const u = clamp(fp - (f.lv - 2) - f.s * 0.2 - 0.35, 0, 1);
        if (u <= 0) { hideI(fins, i); return; }
        const ry = f.s * Math.PI / 2, d = f.n / 2 + 0.12, e = easeOut(u);
        setI(fins, i, Math.sin(ry) * d + Math.cos(ry) * f.off, f.lv - 1.5, Math.cos(ry) * d - Math.sin(ry) * f.off, 1, Math.max(TINY, e), 1, ry);
      });
      fins.instanceMatrix.needsUpdate = true;
      GARDEN.forEach((g, i) => {
        const u = clamp(fp - (g.y + 1) - 1, 0, 1);
        if (u <= 0) { hideI(planters, i); return; }
        const ry = g.s * Math.PI / 2;
        setI(planters, i, Math.sin(ry) * g.mid, g.y + 0.06, Math.cos(ry) * g.mid, g.len, 0.42 * easeOut(u), 0.46, ry);
      });
      planters.instanceMatrix.needsUpdate = true;
    }
    const lights = seg(night, 0.04, 0.9);
    if (changed('lit', Math.round(lights * 300) + (p.facade >= 1 ? 1000 : 0))) {
      LIT.forEach((w, i) => {
        if (p.facade < 1 || lights < w.r * 0.9 + 0.05) { hideI(lit, i); return; }
        const ry = w.s * Math.PI / 2, d = w.n / 2 + 0.052;
        setI(lit, i, Math.sin(ry) * d + Math.cos(ry) * w.off, w.lv - 1.5, Math.cos(ry) * d - Math.sin(ry) * w.off, 1, 1, 1, ry);
      });
      lit.instanceMatrix.needsUpdate = true;
    }
    const sp = easeOut(p.spire);
    lantern.visible = sp > 0.001; lantern.scale.set(1, Math.max(TINY, sp), 1); lantern.position.y = 36 + 0.8 * sp;
    lanternMat.emissiveIntensity = 0.15 + 2.2 * lights;
    spire.visible = sp > 0.3; spire.scale.y = Math.max(TINY, seg(sp, 0.3, 1)); spire.position.y = 36 + 1.6 * sp;
    crownGlow.visible = sp > 0.9 && lights > 0.02; crownGlow.material.opacity = 0.75 * lights;
    beacon.position.set(0, 36 + 1.6 * sp + 4.5, 0);
    beacon.visible = sp > 0.98 && night > 0.15 && (!amb || Math.sin(time * 2.2) > -0.25);
    beacon.material.opacity = 0.9;

    // handover and the city
    const tidy = ease(p.tidy);
    plaza.visible = pool.visible = p.tidy > 0;
    plaza.scale.set(Math.max(TINY, tidy), 1, Math.max(TINY, tidy)); pool.scale.set(Math.max(TINY, seg(p.tidy, 0.5, 1)), 1, 1);
    if (changed('lots', p.lots)) {
      LOTS.forEach((l, i) => { if (lotU(l) <= 0) hideI(lots, i); else setI(lots, i, l.x, lotY(l), l.z, 14, 1.2, 14); });
      lots.instanceMatrix.needsUpdate = true;
      const st = Math.max(TINY, easeOut(seg(p.lots, 0, 0.35)));
      streets.scale.set(st, 1, st); streets.visible = p.lots > 0;
    }
    if (changed('trees', p.tidy * 7 + p.lots)) {
      TREES.forEach((t, i) => {
        const u = t[2] ? seg(lotU(t[3]), 0.7 + t.r * 0.2, 1) : seg(p.tidy, 0.3 + t.r * 0.4, 0.75 + t.r * 0.25);
        if (u <= 0) { hideI(trunks, i); hideI(crowns, i); return; }
        const sc = easeOut(u) * t.s, y = t[2] ? lotY(t[3]) : 0.08;
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

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    if (w < 761) {
      camera.fov = 38; camera.aspect = w / (h * 1.36); camera.setViewOffset(w, h * 1.36, 0, h * 0.36, w, h);
      fit = clamp(Math.pow(1.25 / (w / h), 0.7), 1, 1.9);
    } else {
      camera.fov = 30; camera.aspect = (w * 1.26) / h; camera.setViewOffset(w * 1.26, h, 0, 0, w, h);
      fit = clamp(Math.pow(1.6 / (w / h), 0.6), 1, 1.5);
    }
    camera.updateProjectionMatrix();
  }
  return { update, resize };
}

/* =================== page =================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const fine = !reduceMotion && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

/* custom cursor */
const cur = $('#cursor');
let cursorStep = null;
if (fine && cur) {
  let cx = -100, cy = -100, tx = -100, ty = -100;
  window.addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; cur.classList.add('is-on'); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
  document.addEventListener('pointerover', e => {
    const t = e.target;
    cur.classList.toggle('is-link', !!(t && t.closest && t.closest('a,button,select,input,textarea,.plan-stage,.mat')));
  });
  cursorStep = () => { cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22; cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)'; };
}

/* residences: indicative plans in a 400 x 400 frame, drawn as layered 3D */
const PLANS = {
  sky: { name: 'The Sky Residence', outer: [40, 70, 320, 270], terraces: [[20, 30, 360, 40], [360, 70, 20, 270]], pools: [], voids: [], stairs: [],
    rooms: [[40, 70, 200, 120, 'Living'], [240, 70, 120, 110, 'Dining'], [240, 180, 120, 70, 'Kitchen'], [40, 190, 100, 90, 'Bedroom'], [140, 190, 100, 90, 'Bedroom'], [140, 280, 100, 60, 'Lift lobby'], [240, 250, 120, 90, 'Master suite'], [40, 280, 100, 60, 'Bedroom']] },
  duplex: { name: 'The Duplex, lower floor', outer: [50, 50, 310, 300], terraces: [[20, 20, 370, 30], [20, 50, 30, 300]], pools: [], voids: [[50, 50, 190, 150]], stairs: [[190, 200, 50, 80]],
    rooms: [[50, 50, 190, 150, 'Double-height living'], [240, 50, 120, 100, 'Dining'], [240, 150, 120, 80, 'Kitchen'], [50, 200, 140, 100, 'Guest suite'], [190, 200, 50, 80, ''], [240, 230, 120, 70, 'Family lounge'], [190, 280, 50, 70, 'Lift'], [50, 300, 140, 50, 'Powder · Staff'], [240, 300, 120, 50, 'Utility']] },
  penthouse: { name: 'The Penthouse', outer: [70, 90, 260, 250], terraces: [[20, 20, 360, 360]], pools: [[90, 36, 220, 36]], voids: [], stairs: [],
    rooms: [[70, 90, 180, 120, 'Great room'], [250, 90, 80, 120, 'Kitchen'], [70, 210, 110, 130, 'Master suite'], [180, 210, 70, 60, 'Study'], [180, 270, 70, 70, 'Lift'], [250, 210, 80, 130, 'Bedroom']] }
};
const rectAttr = r => 'x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '"';
function planSVG(pl, wallsOnly) {
  let s = '<svg viewBox="0 0 400 400" aria-hidden="true">';
  if (!wallsOnly) {
    pl.terraces.forEach(r => { s += '<rect class="terrace" ' + rectAttr(r) + '/>'; });
    pl.pools.forEach(r => { s += '<rect class="pool" ' + rectAttr(r) + '/>'; });
    pl.rooms.forEach(r => { s += '<rect class="room" ' + rectAttr(r) + '/>'; });
    pl.voids.forEach(r => { s += '<path class="void" d="M' + r[0] + ' ' + r[1] + 'L' + (r[0] + r[2]) + ' ' + (r[1] + r[3]) + 'M' + (r[0] + r[2]) + ' ' + r[1] + 'L' + r[0] + ' ' + (r[1] + r[3]) + '"/>'; });
    pl.stairs.forEach(r => { let d = ''; for (let y = r[1] + 8; y < r[1] + r[3]; y += 8) d += 'M' + r[0] + ' ' + y + 'H' + (r[0] + r[2]); s += '<path class="stair" d="' + d + '"/>'; });
    pl.rooms.forEach(r => { if (r[4]) s += '<text x="' + (r[0] + r[2] / 2) + '" y="' + (r[1] + r[3] / 2 + 3) + '" text-anchor="middle">' + r[4] + '</text>'; });
  } else {
    pl.rooms.forEach(r => { s += '<rect class="room" ' + rectAttr(r) + '/>'; });
  }
  return s + '<rect class="walls" ' + rectAttr(pl.outer) + '/></svg>';
}
const planEl = $('#plan'), planStage = $('#planStage'), planNote = $('#planNote');
function drawPlan(key) {
  const pl = PLANS[key]; if (!pl || !planEl) return;
  let html = '';
  for (let i = 6; i >= 1; i--) html += '<div class="layer" style="position:absolute;inset:0;transform:translateZ(' + (-i * 3) + 'px)">' + planSVG(pl, true) + '</div>';
  planEl.innerHTML = html + planSVG(pl, false);
  planNote.textContent = pl.name;
}
const tabs = $$('.tab');
function selectTab(key, focus) {
  tabs.forEach(t => { const on = t.dataset.key === key; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  $$('.panel').forEach(p => { p.hidden = p.dataset.key !== key; });
  drawPlan(key);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.key));
  t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.key, true);
  });
});
drawPlan('sky');
if (planStage) planStage.addEventListener('click', () => planStage.classList.toggle('is-flat'));
$$('[data-intent]').forEach(a => a.addEventListener('click', () => { const sel = $('#fIntent'); if (sel) sel.value = a.dataset.intent; }));

/* enquiry form: preview only, nothing is sent */
const form = $('#enquiry'), note = $('#formNote');
form.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#fName').value.trim(), contact = $('#fContact').value.trim();
  note.classList.add('is-shown');
  if (!name || !contact) {
    note.textContent = !name ? 'Please add your name.' : 'Please add a phone number or email so we can reach you.';
    (!name ? $('#fName') : $('#fContact')).focus();
    return;
  }
  note.textContent = 'Thank you, ' + name + '. This page is a preview, so the form is not connected yet and nothing was sent.';
});

/* statement: words light up as it scrolls past */
const statement = $('#statement'), words = [];
if (statement) {
  Array.from(statement.childNodes).forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement('span'); w.className = 'w'; w.textContent = part; frag.appendChild(w); words.push(w);
      });
      statement.replaceChild(frag, n);
    } else if (n.nodeType === 1) { n.classList.add('w'); words.push(n); }
  });
}
const marquee = $('#marquee');

/* scroll story: each chapter drives its own slice of T */
const steps = $$('.chapter');
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

/* rail and metrics */
const railBtns = $$('#rail button'), railBars = $$('#rail i');
const mDepth = $('#mDepth'), mLevel = $('#mLevel'), mHeight = $('#mHeight');
let lastRO = '', storyOff = null;
function updateHud(T) {
  const r = readout(T);
  const key = r.stage + '|' + r.depth.toFixed(1) + '|' + r.level + '|' + Math.round(r.height) + '|' + T.toFixed(3);
  if (key === lastRO) return; lastRO = key;
  mDepth.innerHTML = r.depth.toFixed(1) + '<small>m</small>';
  mLevel.textContent = r.level;
  mHeight.innerHTML = Math.round(r.height) + '<small>m</small>';
  railBtns.forEach((b, i) => b.classList.toggle('is-on', i === r.stage));
  railBars.forEach((b, i) => b.style.setProperty('--f', stageP(T, i).toFixed(3)));
}

/* timelapse in cinema mode */
let tl = null;
const tlBar = $('#timelapse');
function startTimelapse() {
  measure();
  const end = yForT(1), from = end - window.scrollY < 10 ? 0 : window.scrollY;
  tl = { t0: performance.now(), from, to: end, dur: Math.max(2500, 38000 * (end - from) / Math.max(1, end)) };
  tlBar.hidden = false; document.body.classList.add('is-cinema');
}
function stopTimelapse() { if (!tl) return; tl = null; tlBar.hidden = true; document.body.classList.remove('is-cinema'); }
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
railBtns.forEach(b => b.addEventListener('click', () => {
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
  canvas.style.background = 'radial-gradient(ellipse at 60% 40%, #2a3346, #0b0c0e 70%)';
  if (window.console) console.warn('3D view unavailable:', err);
}
function onResize() { measure(); if (api) api.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', onResize);
onResize();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
window.addEventListener('load', measure);

let storyOn = true;
if ('IntersectionObserver' in window) new IntersectionObserver(es => { storyOn = es[0].isIntersecting; }).observe($('#build'));
const topbar = $('#topbar'), rail = $('#rail'), metrics = $('#metrics');
const tStart = performance.now();
let Tcur = scrollT(window.scrollY), prev = tStart, lastLit = -1, solid = null;
function frame(now) {
  requestAnimationFrame(frame);
  stepTimelapse(now);
  if (cursorStep) cursorStep();
  const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000)); prev = now;
  const y = window.scrollY, Tt = scrollT(y);
  Tcur += (Tt - Tcur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 5));
  if (Math.abs(Tt - Tcur) < 1e-5) Tcur = Tt;
  updateHud(Tcur);
  const storyEnd = bounds[bounds.length - 1].bottom;
  const off = y + vh * 0.55 > storyEnd;
  if (off !== storyOff) { storyOff = off; rail.classList.toggle('is-off', off); metrics.classList.toggle('is-off', off); }
  const sol = y > storyEnd - 80;
  if (sol !== solid) { solid = sol; topbar.classList.toggle('is-solid', sol); }
  if (words.length) {
    const r = statement.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      const n = Math.round(clamp((vh * 0.88 - r.top) / (r.height + vh * 0.3), 0, 1) * words.length);
      if (n !== lastLit) { lastLit = n; words.forEach((w, i) => w.classList.toggle('on', i < n)); }
    }
  }
  if (marquee) {
    const r = marquee.parentElement.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      const u = clamp((vh - r.top) / (vh + r.height), 0, 1);
      marquee.style.setProperty('--mx', (-u * Math.max(0, marquee.scrollWidth - window.innerWidth * 0.7)).toFixed(1) + 'px');
    }
  }
  if (api && storyOn) {
    try { api.update(Tcur, (now - tStart) / 1000, dt); }
    catch (err) { api = null; $('#stageNote').hidden = false; if (window.console) console.warn('3D view stopped:', err); }
  }
}
requestAnimationFrame(frame);
})();
