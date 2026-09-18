/* 铁笼竞技场 3D —— Iron Arena 3D
   单文件网页 3D 格斗，依赖 three.js (UMD) */
window.startApp = function () {
'use strict';

var T = window.THREE;
if (!T) return;

/* ============================================================
   0. 基础工具
============================================================ */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, l, dt) { return lerp(a, b, 1 - Math.exp(-l * dt)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function wrapPI(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
function angDamp(a, b, l, dt) { return a + wrapPI(b - a) * (1 - Math.exp(-l * dt)); }
function $(id) { return document.getElementById(id); }

/* ============================================================
   1. 音效（WebAudio 合成，无外部资源）
============================================================ */
var SFX = (function () {
  var ctx = null, master = null, muted = false, noise = null, beat = 0, acc = 0, bpm = 132;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      var len = ctx.sampleRate * 0.5;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function now() { return ctx.currentTime; }
  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(type, f0, f1, dur, vol, dest) {
    if (!ctx || muted) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now());
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now() + dur);
    env(g, now(), 0.005, dur, vol);
    o.connect(g); g.connect(dest || master);
    o.start(now()); o.stop(now() + dur + 0.05);
  }
  function burst(dur, vol, freq, q, type) {
    if (!ctx || muted) return;
    var s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
    var g = ctx.createGain();
    env(g, now(), 0.004, dur, vol);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(now()); s.stop(now() + dur + 0.05);
  }
  return {
    ensure: ensure,
    get muted() { return muted; },
    toggle: function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    swing: function (heavy) { burst(heavy ? 0.18 : 0.1, heavy ? 0.16 : 0.1, heavy ? 700 : 1500, 0.8); },
    hit: function (heavy) {
      tone('sine', heavy ? 190 : 260, heavy ? 42 : 70, heavy ? 0.22 : 0.13, heavy ? 0.5 : 0.3);
      burst(heavy ? 0.16 : 0.09, heavy ? 0.4 : 0.24, heavy ? 1100 : 2200, 0.7);
      if (heavy) tone('triangle', 90, 30, 0.3, 0.3);
    },
    guard: function () { tone('square', 620, 420, 0.09, 0.16); burst(0.08, 0.16, 3200, 3); },
    parry: function () {
      tone('triangle', 1350, 2600, 0.16, 0.22);
      tone('sine', 700, 1400, 0.22, 0.16);
      burst(0.2, 0.2, 5200, 4);
    },
    jump: function () { tone('sine', 320, 620, 0.12, 0.1); },
    land: function () { burst(0.09, 0.16, 260, 1); },
    dodge: function () { burst(0.22, 0.12, 900, 0.6, 'highpass'); },
    ko: function () {
      tone('sine', 130, 28, 1.1, 0.5);
      tone('sawtooth', 200, 40, 0.7, 0.18);
      burst(0.7, 0.3, 500, 0.5);
    },
    ui: function () { tone('sine', 660, 880, 0.09, 0.16); },
    bell: function (f) { tone('sine', f || 880, f || 880, 0.4, 0.22); tone('sine', (f || 880) * 1.5, (f || 880) * 1.5, 0.35, 0.1); },
    /* 简易节奏背景乐 */
    music: function (dt, intensity) {
      if (!ctx || muted) return;
      acc += dt;
      var spb = 60 / bpm;
      while (acc >= spb / 2) {
        acc -= spb / 2;
        var t = beat % 8;
        var vol = 0.09 + intensity * 0.05;
        if (t % 2 === 0) tone('sine', 105, 42, 0.16, vol);
        if (t === 2 || t === 6) burst(0.05, 0.035, 7000, 2, 'highpass');
        if (t === 4) tone('sawtooth', 82, 78, 0.28, 0.035 + intensity * 0.02);
        if (t % 4 === 3) burst(0.12, 0.05, 1800, 1);
        beat++;
      }
    }
  };
})();

/* ============================================================
   2. 渲染器 / 场景 / 相机
============================================================ */
var ARENA_R = 13;
var GRAV = -30;

var canvas = $('scene');
var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

var scene = new T.Scene();
scene.fog = new T.Fog(0x0b101e, 38, 110);

var camera = new T.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 6, 12);

var camYaw = 0, camOffset = 0, camZoom = 1, camDist = 11, camHeight = 4.2;
var shake = 0;

/* ============================================================
   3. 灯光
============================================================ */
var hemi = new T.HemisphereLight(0x8fb0f0, 0x241c16, 0.5);
scene.add(hemi);

var sun = new T.DirectionalLight(0xffe8cc, 1.0);
sun.position.set(9, 18, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.02;
scene.add(sun);

var rim1 = new T.PointLight(0x2f9fd8, 0.7, 34, 2); rim1.position.set(-12, 6, -9); scene.add(rim1);
var rim2 = new T.PointLight(0xd8622a, 0.6, 34, 2); rim2.position.set(12, 5, 10); scene.add(rim2);

/* ============================================================
   4. 竞技场
============================================================ */
(function buildArena() {
  // 天穹（顶点色渐变，走标准管线，避免自定义 shader 的色彩差异）
  var skyGeo = new T.SphereGeometry(150, 32, 20);
  var sp = skyGeo.attributes.position;
  var scol = new Float32Array(sp.count * 3);
  var cTop = new T.Color(0x070c18), cMid = new T.Color(0x1b2740), cBot = new T.Color(0x191320), ctmp = new T.Color();
  for (var si = 0; si < sp.count; si++) {
    var h = sp.getY(si) / 150;
    if (h > 0.18) ctmp.copy(cMid).lerp(cTop, clamp((h - 0.18) / 0.67, 0, 1));
    else ctmp.copy(cBot).lerp(cMid, clamp((h + 0.25) / 0.43, 0, 1));
    scol[si * 3] = ctmp.r; scol[si * 3 + 1] = ctmp.g; scol[si * 3 + 2] = ctmp.b;
  }
  skyGeo.setAttribute('color', new T.BufferAttribute(scol, 3));
  var sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({
    vertexColors: true, side: T.BackSide, fog: false, depthWrite: false
  }));
  scene.add(sky);

  // 主平台
  var floorMat = new T.MeshStandardMaterial({ color: 0x262c3d, roughness: 0.93, metalness: 0.06 });
  var floor = new T.Mesh(new T.CylinderGeometry(ARENA_R, ARENA_R + 0.7, 1.4, 72), floorMat);
  floor.position.y = -0.7; floor.receiveShadow = true; scene.add(floor);

  // 台外裙边地面
  var skirt = new T.Mesh(new T.RingGeometry(ARENA_R + 0.4, 46, 72),
    new T.MeshStandardMaterial({ color: 0x141824, roughness: 0.96, metalness: 0.02 }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.72; skirt.receiveShadow = true;
  scene.add(skirt);

  // 台面纹路
  var seg = [];
  for (var r = 2.2; r <= ARENA_R - 0.6; r += 2.4) {
    for (var i = 0; i < 72; i++) {
      var a0 = i / 72 * Math.PI * 2, a1 = (i + 1) / 72 * Math.PI * 2;
      seg.push(Math.cos(a0) * r, 0.012, Math.sin(a0) * r, Math.cos(a1) * r, 0.012, Math.sin(a1) * r);
    }
  }
  for (var k = 0; k < 24; k++) {
    var a = k / 24 * Math.PI * 2;
    seg.push(Math.cos(a) * 1.4, 0.012, Math.sin(a) * 1.4, Math.cos(a) * (ARENA_R - 0.6), 0.012, Math.sin(a) * (ARENA_R - 0.6));
  }
  var lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.Float32BufferAttribute(seg, 3));
  scene.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x5c86c4, transparent: true, opacity: 0.22 })));

  // 中心标记 + 边圈
  var markMat = new T.MeshBasicMaterial({ color: 0xffc24d, transparent: true, opacity: 0.3, side: T.DoubleSide });
  var mark = new T.Mesh(new T.RingGeometry(3.6, 3.75, 64), markMat);
  mark.rotation.x = -Math.PI / 2; mark.position.y = 0.015; scene.add(mark);
  var edgeMat = new T.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.5, side: T.DoubleSide });
  var edge = new T.Mesh(new T.RingGeometry(ARENA_R - 0.62, ARENA_R - 0.42, 80), edgeMat);
  edge.rotation.x = -Math.PI / 2; edge.position.y = 0.015; scene.add(edge);

  // 发光护栏
  var rail = new T.Mesh(new T.TorusGeometry(ARENA_R - 0.05, 0.07, 8, 96), new T.MeshBasicMaterial({ color: 0x49d8ff }));
  rail.rotation.x = -Math.PI / 2; rail.position.y = 0.07; scene.add(rail);

  // 立柱 + 灯
  var pillarMat = new T.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.7, metalness: 0.5 });
  var lampGeo = new T.SphereGeometry(0.24, 12, 10);
  for (var j = 0; j < 8; j++) {
    var ang = j / 8 * Math.PI * 2 + 0.2;
    var px = Math.cos(ang) * (ARENA_R + 1.5), pz = Math.sin(ang) * (ARENA_R + 1.5);
    var pil = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 5.6, 8), pillarMat);
    pil.position.set(px, 2.8, pz); pil.castShadow = true; scene.add(pil);
    var lamp = new T.Mesh(lampGeo, new T.MeshBasicMaterial({ color: (j % 2) ? 0xff8a3c : 0x54d6ff }));
    lamp.position.set(px, 5.7, pz); scene.add(lamp);
  }

  // 观众（InstancedMesh 剪影）
  var count = isTouch() ? 64 : 130;
  var crowd = new T.InstancedMesh(new T.BoxGeometry(0.34, 0.85, 0.34), new T.MeshBasicMaterial({ color: 0xffffff }), count);
  var dummy = new T.Object3D(), col = new T.Color();
  for (var c = 0; c < count; c++) {
    var row = c % 3, idx = (c / 3) | 0;
    var rr = ARENA_R + 3.4 + row * 1.5;
    var aa = idx / 44 * Math.PI * 2 + rand(-0.05, 0.05);
    var hgt = 1.0 + rand(0, 0.5);
    dummy.position.set(Math.cos(aa) * rr, -0.7 + row * 0.8 + hgt * 0.42, Math.sin(aa) * rr);
    dummy.scale.set(1, hgt, 1);
    dummy.rotation.y = -aa + Math.PI / 2;
    dummy.updateMatrix();
    crowd.setMatrixAt(c, dummy.matrix);
    var g = 0.03 + Math.random() * 0.06;
    col.setRGB(g * 0.7, g * 0.85, g * 1.3);
    if (Math.random() < 0.06) col.setRGB(0.32, 0.2, 0.09);
    crowd.setColorAt(c, col);
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  scene.add(crowd);
})();

/* ============================================================
   5. 角色
============================================================ */
function createFighter(cfg) {
  var f = {};
  var S = cfg.scale || 1;
  var mats = [];
  function mk(color, rough, metal) {
    var m = new T.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.6 : rough, metalness: metal === undefined ? 0.12 : metal });
    mats.push(m); return m;
  }
  var mSkin = mk(cfg.skin, 0.75, 0.03);
  var mSuit = mk(cfg.suit, 0.55, 0.22);
  var mAcc = mk(cfg.accent, 0.42, 0.45);
  var mGlove = mk(cfg.glove, 0.5, 0.18);
  var mDark = mk(0x151a26, 0.65, 0.3);
  var mHair = mk(cfg.hair, 0.85, 0.02);
  var mEye = new T.MeshBasicMaterial({ color: 0x0a0d14 });

  var root = new T.Group();
  var rig = new T.Group();
  root.add(rig);
  scene.add(root);

  function box(w, h, d, mat, x, y, z) {
    var m = new T.Mesh(new T.BoxGeometry(w * S, h * S, d * S), mat);
    m.position.set(x * S, y * S, z * S);
    m.castShadow = true;
    return m;
  }

  // 髋
  var hips = new T.Group(); hips.position.y = 0.95 * S; rig.add(hips);
  hips.add(box(0.46, 0.28, 0.3, mSuit, 0, 0, 0));
  hips.add(box(0.5, 0.09, 0.33, mDark, 0, 0.1, 0));

  // 胸
  var chest = new T.Group(); chest.position.y = 0.13 * S; hips.add(chest);
  chest.add(box(0.56, 0.56, 0.33, mSuit, 0, 0.29, 0));
  chest.add(box(0.6, 0.26, 0.37, mAcc, 0, 0.42, 0));
  chest.add(box(0.14, 0.5, 0.36, mAcc, 0, 0.3, 0.005));

  // 头
  var neck = new T.Group(); neck.position.y = 0.6 * S; chest.add(neck);
  neck.add(box(0.28, 0.12, 0.26, mSkin, 0, 0.03, 0));
  var head = box(0.32, 0.34, 0.3, mSkin, 0, 0.22, 0); neck.add(head);
  neck.add(box(0.35, 0.13, 0.33, mHair, 0, 0.36, -0.005));
  var band = box(0.35, 0.06, 0.34, mAcc, 0, 0.31, 0.005); neck.add(band);
  neck.add(box(0.055, 0.045, 0.03, mEye, -0.075, 0.235, 0.155));
  neck.add(box(0.055, 0.045, 0.03, mEye, 0.075, 0.235, 0.155));

  // 手臂
  function arm(side) {
    var sh = new T.Group(); sh.position.set(0.36 * S * side, 0.5 * S, 0); chest.add(sh);
    sh.add(box(0.19, 0.36, 0.19, mSkin, 0, -0.18, 0));
    var shPad = box(0.24, 0.16, 0.24, mAcc, 0, -0.03, 0); sh.add(shPad);
    var el = new T.Group(); el.position.y = -0.36 * S; sh.add(el);
    el.add(box(0.17, 0.34, 0.17, mSkin, 0, -0.17, 0));
    el.add(box(0.19, 0.1, 0.19, mGlove, 0, -0.31, 0));
    var fist = box(0.2, 0.22, 0.21, mGlove, 0, -0.46, 0); el.add(fist);
    return { shoulder: sh, elbow: el, fist: fist };
  }
  var armL = arm(-1), armR = arm(1);

  // 腿
  function leg(side) {
    var hp = new T.Group(); hp.position.set(0.16 * S * side, -0.11 * S, 0); hips.add(hp);
    hp.add(box(0.22, 0.4, 0.22, mSuit, 0, -0.2, 0));
    var kn = new T.Group(); kn.position.y = -0.4 * S; hp.add(kn);
    kn.add(box(0.19, 0.4, 0.19, mSuit, 0, -0.2, 0));
    var footMesh = box(0.22, 0.12, 0.34, mDark, 0, -0.42, 0.06);
    kn.add(footMesh);
    return { hip: hp, knee: kn, foot: footMesh };
  }
  var legL = leg(-1), legR = leg(1);

  f.j = { hips: hips, chest: chest, neck: neck, head: head, armL: armL, armR: armR, legL: legL, legR: legR };
  f.root = root; f.rig = rig; f.mats = mats; f.hitY = 1.25 * S;
  f.radius = 0.46;

  // 脚下光环（区分敌我）
  var halo = new T.Mesh(
    new T.RingGeometry(0.55, 0.72, 32),
    new T.MeshBasicMaterial({ color: cfg.halo, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; root.add(halo);
  f.halo = halo;

  // 状态
  f.x = 0; f.z = 0; f.y = 0; f.vx = 0; f.vz = 0; f.vy = 0;
  f.onGround = true; f.state = 'idle'; f.age = 0;
  f.hp = 100; f.maxHp = 100; f.hpDelay = 1;
  f.atk = null; f.atkT = 0; f.atkHit = false; f.airUsed = false;
  f.hitstun = 0; f.hitstunMax = 0.3;
  f.guarding = false; f.guardStart = -9;
  f.dodgeT = 0; f.dodgeCd = 0; f.dodgeRec = 0; f.dodgeDX = 0; f.dodgeDZ = 0; f.rollSpin = 0;
  f.invuln = 0; f.flashT = 0; f.koT = 0;
  f.combo = 0; f.comboT = 0;
  f.dmgMul = 1; f.speedMul = 1;
  f.animT = 0; f.bob = 0;
  f.input = { mx: 0, mz: 0, jump: false, guard: false, punchL: false, punchH: false, kickL: false, kickH: false, dodge: false };
  f.ai = { t: 0, plan: 'chase', planT: 0, react: 0.3, reactT: 0, aggr: 0.5, block: 0.3, pending: null };
  f.name = cfg.name;
  return f;
}

var PLAYER_CFG = {
  name: '挑战者', skin: 0xc08a5f, suit: 0x18467e, accent: 0x2fa8d8,
  glove: 0xe2e8f2, hair: 0x2b1d12, halo: 0x49d8ff, scale: 1
};
var FOES = [
  { name: '铁笼新兵', tag: 'ROOKIE', skin: 0xc9905f, suit: 0x2f6f4e, accent: 0x8fd14f, glove: 0x9c3b2e, hair: 0x241a12, halo: 0x8fd14f, hp: 100, scale: 0.98 },
  { name: '沙场老兵', tag: 'VETERAN', skin: 0xb07850, suit: 0x5c3a94, accent: 0xd8b04a, glove: 0x2e4a7d, hair: 0x14100c, halo: 0xd8b04a, hp: 120, scale: 1.02 },
  { name: '钢铁冠军', tag: 'CHAMPION', skin: 0x9c6b45, suit: 0x1f3f6b, accent: 0xdfe6f0, glove: 0xb02a1e, hair: 0x101014, halo: 0xdfe6f0, hp: 145, scale: 1.06 },
  { name: '无冕之王', tag: 'OVERLORD', skin: 0x7d5340, suit: 0x15151b, accent: 0xff3b2f, glove: 0x8a1410, hair: 0x1a1a1a, halo: 0xff3b2f, hp: 175, scale: 1.1 }
];
var DIFF = [
  { label: '简单', hpMul: 0.85, aggr: 0.42, react: 0.44, block: 0.16, dmg: 0.72, spd: 0.92 },
  { label: '普通', hpMul: 1.00, aggr: 0.58, react: 0.30, block: 0.34, dmg: 1.00, spd: 1.00 },
  { label: '困难', hpMul: 1.15, aggr: 0.71, react: 0.20, block: 0.50, dmg: 1.16, spd: 1.06 },
  { label: '噩梦', hpMul: 1.32, aggr: 0.83, react: 0.13, block: 0.63, dmg: 1.32, spd: 1.12 }
];

var p = createFighter(PLAYER_CFG);
var e = null, foeIdx = 0;

/* ============================================================
   6. 攻击数据
============================================================ */
var ATK = {
  // part: 打击部位（真实骨骼节点）  hitR: 该部位的判定半径（米）
  punchL: { key: 'punchL', label: '轻拳', dmg: 5, start: 0.07, active: 0.06, rec: 0.15, range: 2.6, arc: 1.3, kb: 2.4, hitstun: 0.20, lunge: 1.5, part: ['armR', 'fist'], hitR: 0.32 },
  punchH: { key: 'punchH', label: '重拳', dmg: 11, start: 0.17, active: 0.08, rec: 0.31, range: 2.7, arc: 1.3, kb: 6.8, hitstun: 0.38, lunge: 2.2, part: ['armL', 'fist'], hitR: 0.36 },
  kickL: { key: 'kickL', label: '低踢', dmg: 8, start: 0.12, active: 0.07, rec: 0.23, range: 2.8, arc: 1.3, kb: 4.4, hitstun: 0.30, lunge: 1.8, part: ['legR', 'foot'], hitR: 0.42 },
  kickH: { key: 'kickH', label: '回旋踢', dmg: 15, start: 0.25, active: 0.10, rec: 0.42, range: 3.0, arc: 1.5, kb: 10, hitstun: 0.46, lunge: 2.4, part: ['legR', 'foot'], hitR: 0.5 },
  airK: { key: 'airK', label: '跳踢', dmg: 10, start: 0.10, active: 0.18, rec: 0.20, range: 2.8, arc: 1.4, kb: 5.5, hitstun: 0.34, lunge: 1.6, part: ['legR', 'foot'], hitR: 0.45 }
};
function strikeCurve(t, s, a, total) {
  var ta = s / total, tb = (s + a) / total;
  // 起手阶段把肢体伸到完全展开，active 窗口保持展开（这才是“打到”的那几帧），收招再收回
  if (t < ta) return clamp(t / ta, 0, 1);                 // 起手：0 -> 1 伸展
  if (t < tb) return 1;                                    // 命中窗口：保持完全伸展
  return clamp(1 - (t - tb) / Math.max(0.0001, total - tb), 0, 1); // 收招：1 -> 0 收回
}

/* ============================================================
   7. 特效
============================================================ */
var sparks = [], sparkPool = 90;
var sparkGeo = new T.TetrahedronGeometry(0.085);
(function initSparks() {
  for (var i = 0; i < sparkPool; i++) {
    var m = new T.Mesh(sparkGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.visible = false; scene.add(m);
    sparks.push({ m: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0 });
  }
})();
function spawnSparks(x, y, z, color, n, power) {
  n = n || 12; power = power || 1;
  var made = 0;
  for (var i = 0; i < sparkPool && made < n; i++) {
    var s = sparks[i];
    if (s.life > 0) continue;
    made++;
    s.life = s.max = rand(0.22, 0.5);
    var sp = rand(3, 9) * power;
    var a = Math.random() * Math.PI * 2, b = rand(-0.4, 1.2);
    s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = b * sp * 0.8;
    s.rx = rand(-14, 14); s.ry = rand(-14, 14);
    s.m.position.set(x, y, z);
    s.m.material.color.setHex(color);
    s.m.material.opacity = 1;
    s.m.scale.setScalar(rand(0.7, 1.5) * power);
    s.m.visible = true;
  }
}
var rings = [], ringPool = 10;
(function initRings() {
  for (var i = 0; i < ringPool; i++) {
    var m = new T.Mesh(new T.RingGeometry(0.34, 0.5, 32), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: T.DoubleSide, depthWrite: false }));
    m.visible = false; scene.add(m);
    rings.push({ m: m, life: 0, max: 1, flat: false, s0: 1, s1: 2 });
  }
})();
function spawnRing(x, y, z, color, size, flat) {
  for (var i = 0; i < ringPool; i++) {
    var r = rings[i];
    if (r.life > 0) continue;
    r.life = r.max = flat ? 0.45 : 0.3;
    r.flat = !!flat;
    r.s0 = size * 0.35; r.s1 = size * (flat ? 3.2 : 2.4);
    r.m.position.set(x, y, z);
    r.m.material.color.setHex(color);
    r.m.material.opacity = 0.95;
    r.m.visible = true;
    if (flat) { r.m.rotation.set(-Math.PI / 2, 0, 0); }
    return;
  }
}
function updateFx(dt) {
  var i, s;
  for (i = 0; i < sparkPool; i++) {
    s = sparks[i];
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.m.visible = false; continue; }
    s.vy -= 22 * dt;
    s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
    if (s.m.position.y < 0.05) { s.m.position.y = 0.05; s.vy *= -0.35; s.vx *= 0.7; s.vz *= 0.7; }
    s.m.rotation.x += s.rx * dt; s.m.rotation.y += s.ry * dt;
    var k = s.life / s.max;
    s.m.scale.setScalar(Math.max(0.05, k * 1.4));
    s.m.material.opacity = k;
  }
  for (i = 0; i < ringPool; i++) {
    var r = rings[i];
    if (r.life <= 0) continue;
    r.life -= dt;
    if (r.life <= 0) { r.m.visible = false; continue; }
    var t = 1 - r.life / r.max;
    var sc = lerp(r.s0, r.s1, t * t * (3 - 2 * t));
    r.m.scale.setScalar(sc);
    r.m.material.opacity = (1 - t) * 0.95;
    if (!r.flat) r.m.quaternion.copy(camera.quaternion);
  }
}

function addShake(v) { shake = Math.min(1.4, shake + v); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }
function flashScreen(a) {
  var el = $('flash');
  el.style.transition = 'none'; el.style.opacity = a;
  requestAnimationFrame(function () { el.style.transition = 'opacity .28s'; el.style.opacity = 0; });
}
function flashBody(f, t) { f.flashT = t; }

/* ============================================================
   8. 输入
============================================================ */
var keys = {}, justPressed = {};
var KEYMAP = { 'u': 'punchL', 'i': 'punchH', 'j': 'kickL', 'k': 'kickH' };

window.addEventListener('keydown', function (ev) {
  var k = (ev.key || '').toLowerCase();
  if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') ev.preventDefault();
  if (!keys[k]) justPressed[k] = true;
  keys[k] = true;
});
window.addEventListener('keyup', function (ev) { keys[(ev.key || '').toLowerCase()] = false; });
window.addEventListener('blur', function () { keys = {}; });

// 视角拖动 / 缩放
var dragging = false, lastX = 0;
canvas.addEventListener('pointerdown', function (ev) { dragging = true; lastX = ev.clientX; });
window.addEventListener('pointerup', function () { dragging = false; });
window.addEventListener('pointermove', function (ev) {
  if (!dragging) return;
  camOffset -= (ev.clientX - lastX) * 0.006;
  camOffset = clamp(camOffset, -1.1, 1.1);
  lastX = ev.clientX;
});
window.addEventListener('wheel', function (ev) {
  camZoom = clamp(camZoom + ev.deltaY * 0.0012, 0.72, 1.45);
}, { passive: true });

// 触屏
var touch = { on: false, x: 0, y: 0, id: -1 };
var tKeys = {};
var touchEl = $('touch');
function isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

// 暂停/继续切换（P 键与触屏暂停按钮共用）
function togglePause() {
  if (G.mode === 'fight' || G.mode === 'intro') {
    G.mode = 'pause'; $('pauseScreen').classList.remove('hidden');
  } else if (G.mode === 'pause') {
    G.mode = 'fight'; $('pauseScreen').classList.add('hidden');
  }
}

if (isTouch()) {
  document.body.classList.add('isTouch');
  // 移动端性能降级
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  if (sun.shadow) sun.shadow.mapSize.set(1024, 1024);

  // 动态摇杆：左半屏任意位置手指落下即生成摇杆
  var sz = $('stickZone'), stick = $('stick'), knob = $('knob');
  var cx0 = 0, cy0 = 0, sActive = false;
  function sMove(ev) {
    var dx = ev.clientX - cx0, dy = ev.clientY - cy0, d = Math.hypot(dx, dy), max = 54;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px)';
    touch.x = dx / max; touch.y = -dy / max; touch.on = true;
  }
  function sEnd() { sActive = false; touch.on = false; touch.x = touch.y = 0; stick.style.display = 'none'; }
  sz.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    sActive = true; cx0 = ev.clientX; cy0 = ev.clientY;
    stick.style.left = cx0 + 'px'; stick.style.top = cy0 + 'px'; stick.style.display = 'block';
    sMove(ev);
    try { sz.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  sz.addEventListener('pointermove', function (ev) { if (sActive) sMove(ev); });
  sz.addEventListener('pointerup', sEnd);
  sz.addEventListener('pointercancel', sEnd);

  function bindT(id, key) {
    var el = $(id);
    el.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      tKeys[key] = true; justPressed[key] = true; el.classList.add('down');
    });
    function up() { tKeys[key] = false; el.classList.remove('down'); }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
  bindT('tU', 'u'); bindT('tI', 'i'); bindT('tJ', 'j'); bindT('tK', 'k');
  bindT('tL', 'l'); bindT('tD', 'shift'); bindT('tJmp', ' ');
  $('tPause').addEventListener('pointerdown', function (ev) { ev.preventDefault(); ev.stopPropagation(); togglePause(); });
}

/* ============================================================
   9. 战斗逻辑
============================================================ */
function facingEach(a, b) {
  var ang = Math.atan2(b.x - a.x, b.z - a.z);
  return Math.abs(wrapPI(ang - a.root.rotation.y)) < 1.15;
}

function tryAttack(f, key) {
  if (f.hitstun > 0 || f.dodgeT > 0 || f.dodgeRec > 0 || f.state === 'ko' || f.state === 'win' || G.mode !== 'fight') return false;
  if (f.state === 'attack') {
    var a = f.atk, total = a.start + a.active + a.rec;
    if (f.atkT < a.start + a.active + a.rec * 0.55) return false;
    if (key === 'kickH' || key === 'punchH') return false;
  }
  var name = key;
  if (!f.onGround) {
    if (f.airUsed) return false;
    name = 'airK'; f.airUsed = true;
  }
  var atk = ATK[name];
  if (!atk) return false;
  f.state = 'attack'; f.atk = atk; f.atkT = 0; f.atkHit = false;
  SFX.swing(name === 'kickH' || name === 'punchH');
  return true;
}

function takeHit(att, def, atk, hx, hy, hz) {
  var dx = def.x - att.x, dz = def.z - att.z;
  var d = Math.hypot(dx, dz) || 0.001;
  var nx = dx / d, nz = dz / d;
  // 命中点取拳头/脚的真实接触位置，特效与判定一致
  hx = (hx === undefined) ? def.x : hx;
  hy = (hy === undefined) ? 1.2 + def.y : hy;
  hz = (hz === undefined) ? def.z : hz;
  var faceOK = facingEach(def, att);

  // 闪避无敌
  if (def.invuln > 0) {
    spawnSparks(hx, hy, hz, 0x7fd6ff, 8, 0.8);
    SFX.dodge();
    return;
  }

  var guarding = def.input.guard && faceOK && def.hitstun <= 0 && def.state !== 'attack';

  // 完美格挡
  if (guarding && (G.clock - def.guardStart) < 0.20) {
    SFX.parry();
    spawnRing(hx, hy, hz, 0xa8f0ff, 1.5);
    spawnSparks(hx, hy, hz, 0xffffff, 16, 1.3);
    flashScreen(0.35);
    addShake(0.35); hitstop(0.13);
    att.hitstun = 0.45; att.hitstunMax = 0.45;
    att.state = 'idle'; att.atk = null; att.combo = 0;
    att.vx = -nx * 3.5; att.vz = -nz * 3.5;
    if (def === p) G.stats.parries++;
    banner('PERFECT', 0.9);
    return;
  }

  if (guarding) {
    var dmg2 = atk.dmg * 0.14 * att.dmgMul;
    def.hp = Math.max(0, def.hp - dmg2);
    def.vx += nx * atk.kb * 0.35; def.vz += nz * atk.kb * 0.35;
    def.hitstun = 0.12; def.hitstunMax = 0.12;
    SFX.guard();
    spawnSparks(hx, hy, hz, 0x9fd8ff, 7, 0.7);
    addShake(0.1);
    return;
  }

  // 正常命中
  var dmg = atk.dmg * att.dmgMul;
  def.hp = Math.max(0, def.hp - dmg);
  def.hitstun = atk.hitstun; def.hitstunMax = atk.hitstun;
  def.state = 'idle'; def.atk = null;
  def.vx = nx * atk.kb; def.vz = nz * atk.kb;
  if (atk.kb > 6) def.vy = Math.max(def.vy, 2.2);
  def.combo = 0;
  flashBody(def, 0.13);

  att.combo++; att.comboT = 1.5;
  if (att === p) {
    G.stats.hits++;
    if (att.combo > G.stats.maxCombo) G.stats.maxCombo = att.combo;
    if (att.combo >= 2) showCombo(att.combo);
  }

  var heavy = atk.dmg >= 11;
  SFX.hit(heavy);
  spawnSparks(hx, hy, hz, heavy ? 0xffd36a : 0xfff0c0, heavy ? 18 : 10, heavy ? 1.35 : 1);
  spawnRing(hx, hy, hz, heavy ? 0xffb03c : 0xffffff, heavy ? 1.6 : 1.1);
  if (heavy) spawnRing(def.x, 0.05, def.z, 0xff8a3c, 1.4, true);
  addShake(heavy ? 0.5 : 0.22);
  hitstop(heavy ? 0.085 : 0.045);
  if (heavy) flashScreen(0.16);
}

/* 命中判定：用拳头 / 脚的真实世界坐标去撞对手身体，
   打不到就是打不到，不再按"中心距离 + 固定 range"隔空判定 */
var _hit = new T.Vector3();
function checkHit(att, def) {
  var atk = att.atk;
  if (!atk || att.atkHit) return;
  if (att.atkT < atk.start || att.atkT > atk.start + atk.active) return;
  if (def.state === 'ko') return;

  // 打击部位世界坐标（动画刚更新过，位置就是画面上看到的位置）
  var limb = att.j[atk.part[0]][atk.part[1]];
  if (!limb) return;
  limb.getWorldPosition(_hit);
  var hx = _hit.x, hy = _hit.y, hz = _hit.z;

  var DBG = window.__DBG;
  // 保险上限：偏离太远直接跳过
  var cdx = def.x - att.x, cdz = def.z - att.z;
  if (Math.hypot(cdx, cdz) > atk.range) { if (DBG) DBG('range', atk.key, Math.hypot(cdx, cdz)); return; }

  // 水平：部位要够到对手身体
  var pdx = hx - def.x, pdz = hz - def.z;
  var hd = Math.hypot(pdx, pdz);
  if (hd > def.radius + 0.14 + atk.hitR) { if (DBG) DBG('far', atk.key, hd); return; }

  // 高度：踢不到跳起来的人，跳踢够得到地面的人
  var bodyTop = def.y + 1.85, bodyBot = def.y - 0.25;
  if (def.state === 'ko') bodyTop = def.y + 0.7;
  if (hy > bodyTop || hy < bodyBot) { if (DBG) DBG('height', atk.key, hy); return; }

  // 朝向：不能打到身后
  var ang = Math.atan2(cdx, cdz);
  if (Math.abs(wrapPI(ang - att.root.rotation.y)) > atk.arc) { if (DBG) DBG('angle', atk.key, 0); return; }
  if (DBG) DBG('HIT', atk.key, hd);

  att.atkHit = true;
  takeHit(att, def, atk, hx, hy, hz);
}

function separate(a, b) {
  var dx = b.x - a.x, dz = b.z - a.z;
  var d = Math.hypot(dx, dz);
  var min = a.radius + b.radius + 0.02;
  if (d < min) {
    if (d < 0.0001) { dx = 1; dz = 0; d = 1; }
    var push = (min - d) * 0.5;
    var nx = dx / d, nz = dz / d;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
  }
}

var MOVE = 5.4;

function updateFighter(f, opp, dt) {
  f.age += dt; f.animT += dt;
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.dodgeCd = Math.max(0, f.dodgeCd - dt);
  f.dodgeRec = Math.max(0, f.dodgeRec - dt);
  f.comboT = Math.max(0, f.comboT - dt);
  if (f.comboT <= 0) f.combo = 0;
  if (f.flashT > 0) f.flashT = Math.max(0, f.flashT - dt);

  var inp = f.input;
  var canAct = f.hitstun <= 0 && f.dodgeRec <= 0 && f.state !== 'ko' && f.state !== 'win' && G.mode === 'fight';

  // 攻击推进
  if (f.state === 'attack') {
    f.atkT += dt;
    var total = f.atk.start + f.atk.active + f.atk.rec;
    if (f.atkT >= total) { f.state = 'idle'; f.atk = null; f.atkHit = false; }
  }

  // 闪避
  if (f.dodgeT > 0) {
    f.dodgeT -= dt;
    var k = clamp(f.dodgeT / 0.46, 0, 1);
    var sp = 12.5 * Math.pow(k, 0.55);
    f.vx = f.dodgeDX * sp; f.vz = f.dodgeDZ * sp;
    if (f.dodgeT <= 0) { f.dodgeRec = 0.1; f.rig.rotation.set(0, 0, 0); }
  }

  // 输入 -> 移动
  var mx = inp.mx, mz = inp.mz;
  var ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }

  if (f.state === 'ko' || f.state === 'win') { mx = 0; mz = 0; }

  var fx = Math.sin(f.root.rotation.y), fz = Math.cos(f.root.rotation.y);
  var back = (mx * fx + mz * fz) < -0.25;
  var spd = MOVE * f.speedMul * (inp.guard ? 0.34 : (back ? 0.8 : 1)) * (f.onGround ? 1 : 0.72);

  if (canAct && f.dodgeT <= 0 && f.state !== 'attack') {
    if (inp.guard && !f.guarding) f.guardStart = G.clock;
    f.guarding = inp.guard;
    f.vx = damp(f.vx, mx * spd, 13, dt);
    f.vz = damp(f.vz, mz * spd, 13, dt);
    if (inp.jump && f.onGround) {
      f.vy = 10.2; f.onGround = false; f.airUsed = false; SFX.jump();
      spawnRing(f.x, 0.04, f.z, 0x9fd8ff, 0.9, true);
    }
  } else if (f.state === 'attack' && f.dodgeT <= 0) {
    var a = f.atk;
    if (f.atkT < a.start) {
      f.vx = damp(f.vx, fx * a.lunge, 9, dt);
      f.vz = damp(f.vz, fz * a.lunge, 9, dt);
    } else {
      f.vx = damp(f.vx, 0, 5.5, dt);
      f.vz = damp(f.vz, 0, 5.5, dt);
    }
    f.guarding = false;
  } else if (f.hitstun > 0 || f.state === 'ko') {
    f.vx = damp(f.vx, 0, 3.2, dt);
    f.vz = damp(f.vz, 0, 3.2, dt);
    f.guarding = false;
  } else {
    f.vx = damp(f.vx, 0, 6, dt);
    f.vz = damp(f.vz, 0, 6, dt);
  }

  // 物理
  f.vy += GRAV * dt;
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  f.y += f.vy * dt;
  if (f.y <= 0) {
    f.y = 0;
    if (!f.onGround) {
      f.onGround = true;
      if (f.state !== 'ko') { SFX.land(); spawnRing(f.x, 0.04, f.z, 0xbfae8f, 1.1, true); addShake(0.06); }
      f.airUsed = false;
    }
    f.vy = 0;
  } else f.onGround = false;

  // 边界
  var rr = Math.hypot(f.x, f.z);
  var lim = ARENA_R - 0.75;
  if (rr > lim) {
    var kk = lim / rr;
    f.x *= kk; f.z *= kk;
    f.vx *= 0.4; f.vz *= 0.4;
  }

  // 朝向对手
  if (f.state !== 'ko') {
    var want = Math.atan2(opp.x - f.x, opp.z - f.z);
    f.root.rotation.y = angDamp(f.root.rotation.y, want, f.state === 'attack' ? 4 : 11, dt);
  }

  // 应用 transform
  f.root.position.set(f.x, f.y, f.z);
  f.halo.material.opacity = f.state === 'ko' ? 0.15 : 0.5;

  // 闪白
  var fl = f.flashT > 0 ? f.flashT / 0.13 : 0;
  if (fl > 0 || f._fl > 0) {
    for (var i = 0; i < f.mats.length; i++) {
      var m = f.mats[i];
      if (m.emissive) m.emissive.setRGB(fl * 0.95, fl * 0.9, fl * 0.85);
    }
  }
  f._fl = fl;
}

/* ============================================================
   10. 动画（手写骨骼姿势）
============================================================ */
function basePose(f, dt) {
  var J = f.j;
  var t = f.animT;
  var moving = Math.hypot(f.vx, f.vz);
  var sp = clamp(moving / MOVE, 0, 1);
  var air = !f.onGround;

  // 复位
  J.hips.position.y = 0.95;
  J.hips.rotation.set(0, 0, 0);
  J.chest.rotation.set(0, 0, 0);
  J.neck.rotation.set(0, 0, 0);
  J.armL.shoulder.rotation.set(0, 0, 0);
  J.armL.elbow.rotation.set(0, 0, 0);
  J.armR.shoulder.rotation.set(0, 0, 0);
  J.armR.elbow.rotation.set(0, 0, 0);
  J.legL.hip.rotation.set(0, 0, 0);
  J.legL.knee.rotation.set(0, 0, 0);
  J.legR.hip.rotation.set(0, 0, 0);
  J.legR.knee.rotation.set(0, 0, 0);
  f.rig.rotation.z = 0;

  // 呼吸
  var br = Math.sin(t * 2.4) * 0.022;

  if (f.state === 'ko') {
    var kk = clamp(f.koT / 0.6, 0, 1);
    f.rig.rotation.x = lerp(0, -Math.PI / 2 * 0.92, kk * kk);
    f.rig.position.y = lerp(0, -0.35, kk);
    J.armL.shoulder.rotation.x = lerp(0, 1.1, kk);
    J.armR.shoulder.rotation.x = lerp(0, 1.1, kk);
    J.legL.hip.rotation.x = lerp(0, -0.35, kk);
    J.legR.hip.rotation.x = lerp(0, -0.2, kk);
    J.legL.knee.rotation.x = lerp(0, 0.5, kk);
    J.neck.rotation.x = lerp(0, 0.35, kk);
    return;
  }
  if (f.state === 'win') {
    var w = Math.sin(t * 3.2);
    J.armR.shoulder.rotation.x = -2.6 + w * 0.15;
    J.armR.elbow.rotation.x = -0.3;
    J.armL.shoulder.rotation.x = -0.5;
    J.armL.elbow.rotation.x = -0.9;
    J.chest.rotation.x = -0.1 + w * 0.03;
    J.hips.position.y = 0.95 + Math.abs(w) * 0.04;
    J.legL.hip.rotation.x = -0.12; J.legR.hip.rotation.x = 0.12;
    J.legL.knee.rotation.x = 0.25; J.legR.knee.rotation.x = 0.28;
    f.rig.rotation.x = 0;
    return;
  }
  f.rig.rotation.x = damp(f.rig.rotation.x, 0, 12, dt);
  f.rig.position.y = damp(f.rig.position.y, 0, 12, dt);

  // 翻滚
  if (f.dodgeT > 0) {
    var kd = 1 - f.dodgeT / 0.46;
    var dot = f.dodgeDX * Math.sin(f.root.rotation.y) + f.dodgeDZ * Math.cos(f.root.rotation.y);
    var dirn = dot >= 0 ? 1 : -1;
    f.rig.rotation.x = -Math.PI * 2 * kd * dirn * clamp(Math.abs(dot), 0.3, 1);
    f.rig.position.y = -0.28 * Math.sin(kd * Math.PI);
    J.hips.position.y = 0.95 - 0.12;
    J.chest.rotation.x = 0.7;
    J.neck.rotation.x = 0.5;
    J.armL.shoulder.rotation.set(-2.2, 0, 0.5); J.armL.elbow.rotation.x = -2.1;
    J.armR.shoulder.rotation.set(-2.2, 0, -0.5); J.armR.elbow.rotation.x = -2.1;
    J.legL.hip.rotation.x = -1.7; J.legL.knee.rotation.x = 1.9;
    J.legR.hip.rotation.x = -1.5; J.legR.knee.rotation.x = 2.0;
    return;
  }

  // 受击
  if (f.hitstun > 0) {
    var hk = clamp(f.hitstun / f.hitstunMax, 0, 1);
    J.chest.rotation.x = 0.55 * hk;
    J.neck.rotation.x = 0.6 * hk;
    J.hips.rotation.x = 0.16 * hk;
    J.armL.shoulder.rotation.set(-0.5 * hk, 0, 0.5 + 0.7 * hk);
    J.armR.shoulder.rotation.set(-0.4 * hk, 0, -0.5 - 0.7 * hk);
    J.armL.elbow.rotation.x = -0.7; J.armR.elbow.rotation.x = -0.7;
    J.legL.hip.rotation.x = 0.3 * hk; J.legR.hip.rotation.x = -0.2 * hk;
    J.legL.knee.rotation.x = 0.4; J.legR.knee.rotation.x = 0.5;
    J.hips.position.y = 0.95 - 0.05 * hk;
    return;
  }

  // 格挡
  if (f.guarding && f.state !== 'attack') {
    J.armL.shoulder.rotation.set(-1.5, 0.4, 0.95); J.armL.elbow.rotation.x = -2.0;
    J.armR.shoulder.rotation.set(-1.5, -0.4, -0.95); J.armR.elbow.rotation.x = -2.0;
    J.chest.rotation.x = 0.12;
    J.neck.rotation.x = 0.1;
    J.hips.position.y = 0.95 - 0.09;
    J.legL.hip.rotation.x = -0.28; J.legR.hip.rotation.x = 0.24;
    J.legL.knee.rotation.x = 0.5; J.legR.knee.rotation.x = 0.55;
    return;
  }

  // 站架
  var guard = 1;
  J.armL.shoulder.rotation.set(-1.18, 0.22, 0.42);
  J.armL.elbow.rotation.x = -1.55;
  J.armR.shoulder.rotation.set(-1.02, -0.26, -0.42);
  J.armR.elbow.rotation.x = -1.85;
  J.legL.hip.rotation.set(-0.2, 0, 0.09);
  J.legL.knee.rotation.x = 0.34;
  J.legR.hip.rotation.set(0.22, 0, -0.11);
  J.legR.knee.rotation.x = 0.4;
  J.hips.position.y = 0.95 - 0.05 + br * 0.4;
  J.chest.rotation.x = 0.06 + br;

  // 空中
  if (air) {
    var up = clamp(f.vy / 8, -1, 1);
    J.legL.hip.rotation.x = -0.75 - up * 0.2; J.legL.knee.rotation.x = 1.25;
    J.legR.hip.rotation.x = 0.35; J.legR.knee.rotation.x = 0.75;
    J.armL.shoulder.rotation.x = -1.5; J.armR.shoulder.rotation.x = -1.35;
    J.chest.rotation.x = 0.16;
    guard = 0;
  }

  // 走动
  if (sp > 0.05 && !air) {
    var w = f.animT * (7 + sp * 3.2);
    var s = Math.sin(w);
    J.legL.hip.rotation.x += s * 0.62 * sp;
    J.legR.hip.rotation.x -= s * 0.62 * sp;
    J.legL.knee.rotation.x += Math.max(0, -s) * 0.95 * sp;
    J.legR.knee.rotation.x += Math.max(0, s) * 0.95 * sp;
    J.armL.shoulder.rotation.x -= s * 0.22 * sp;
    J.armR.shoulder.rotation.x += s * 0.22 * sp;
    J.hips.position.y += Math.abs(Math.sin(w)) * 0.055 * sp;
    J.chest.rotation.y += s * 0.1 * sp;
    J.neck.rotation.y -= s * 0.06 * sp;
  }

  // 攻击姿势覆盖
  if (f.state === 'attack') poseAttack(f);
}

function poseAttack(f) {
  var J = f.j, a = f.atk;
  var total = a.start + a.active + a.rec;
  var ext = strikeCurve(f.atkT, a.start, a.active, total);
  var k = Math.max(0, ext), k1 = clamp(k, 0, 1);
  var airAtk = !f.onGround;

  switch (a.key) {
    case 'punchL':
      J.armR.shoulder.rotation.x = lerp(-1.02, -1.62, k1);
      J.armR.shoulder.rotation.y = lerp(-0.26, 0.1, k1);
      J.armR.shoulder.rotation.z = lerp(-0.42, -0.12, k1);
      J.armR.elbow.rotation.x = lerp(-1.85, -0.05, k1);
      J.chest.rotation.y = lerp(0, 0.42, k1);
      J.hips.rotation.y = lerp(0, 0.14, k1);
      J.neck.rotation.y = lerp(0, -0.2, k1);
      break;
    case 'punchH':
      J.armL.shoulder.rotation.x = lerp(-1.18, -1.5, k1);
      J.armL.shoulder.rotation.y = lerp(0.22, -0.5, k1);
      J.armL.shoulder.rotation.z = lerp(0.42, 0.05, k1);
      J.armL.elbow.rotation.x = lerp(-1.55, -0.06, k1);
      J.chest.rotation.y = lerp(0, -0.62, k1);
      J.chest.rotation.x = lerp(0.06, 0.2, k1);
      J.hips.rotation.y = lerp(0, -0.34, k1);
      J.armR.shoulder.rotation.x = lerp(-1.02, -0.6, k1);
      J.legR.hip.rotation.x = lerp(0.22, 0.5, k1);
      J.legL.hip.rotation.x = lerp(-0.2, -0.42, k1);
      break;
    case 'kickL':
      J.legR.hip.rotation.x = lerp(0.22, -1.42, k1);
      J.legR.knee.rotation.x = lerp(0.4, 0.06, k1);
      J.legL.hip.rotation.x = lerp(-0.2, -0.05, k1);
      J.legL.knee.rotation.x = lerp(0.34, 0.55, k1);
      J.chest.rotation.x = lerp(0.06, 0.34, k1);
      J.hips.rotation.x = lerp(0, 0.16, k1);
      J.armL.shoulder.rotation.x = lerp(-1.18, -0.7, k1);
      J.armR.shoulder.rotation.x = lerp(-1.02, -0.9, k1);
      J.armR.shoulder.rotation.z = lerp(-0.42, -0.9, k1);
      break;
    case 'kickH':
      J.legR.hip.rotation.x = lerp(0.22, -1.32, k1);
      J.legR.hip.rotation.y = lerp(0, 0.85, k1);
      J.legR.knee.rotation.x = lerp(0.4, 0.05, k1);
      J.chest.rotation.y = lerp(0, -0.9, k1);
      J.hips.rotation.y = lerp(0, -0.55, k1);
      J.chest.rotation.x = lerp(0.06, -0.18, k1);
      J.legL.hip.rotation.x = lerp(-0.2, -0.35, k1);
      J.legL.knee.rotation.x = lerp(0.34, 0.7, k1);
      J.armL.shoulder.rotation.x = lerp(-1.18, -0.5, k1);
      J.armL.shoulder.rotation.z = lerp(0.42, 1.3, k1);
      J.armR.shoulder.rotation.z = lerp(-0.42, -1.2, k1);
      J.neck.rotation.y = lerp(0, -0.3, k1);
      J.hips.position.y = 0.95 - 0.05 - 0.06 * k1;
      break;
    case 'airK':
      J.legR.hip.rotation.x = lerp(0.35, -1.5, k1);
      J.legR.knee.rotation.x = lerp(0.75, 0.06, k1);
      J.legL.hip.rotation.x = lerp(-0.75, -0.3, k1);
      J.legL.knee.rotation.x = lerp(1.25, 1.6, k1);
      J.chest.rotation.x = lerp(0.16, 0.5, k1);
      J.armL.shoulder.rotation.x = lerp(-1.5, -1.0, k1);
      J.armR.shoulder.rotation.x = lerp(-1.35, -0.8, k1);
      break;
  }
  if (airAtk && a.key !== 'airK') {
    J.legL.hip.rotation.x = -0.4; J.legL.knee.rotation.x = 1.5;
  }
}

/* ============================================================
   11. AI
============================================================ */
function aiDecide(f, o) {
  var A = f.ai;
  var dx = o.x - f.x, dz = o.z - f.z;
  var d = Math.hypot(dx, dz);

  // 对手正在出招 -> 防御/闪避
  if (o.state === 'attack' && d < 2.4) {
    var r = Math.random();
    if (r < A.block) { A.plan = 'guard'; A.planT = rand(0.25, 0.5); return; }
    if (r < A.block + 0.12 && f.dodgeCd <= 0) { A.plan = 'dodge'; A.planT = 0.3; return; }
  }
  if (d > 2.5) {
    A.plan = Math.random() < 0.86 ? 'chase' : 'circle';
    A.planT = rand(0.3, 0.75);
    A.circleDir = Math.random() < 0.5 ? 1 : -1;
    return;
  }
  if (d < 1.15) {
    A.plan = Math.random() < 0.62 ? 'attack' : 'back';
    A.planT = rand(0.18, 0.4);
    return;
  }
  var rr = Math.random();
  if (rr < A.aggr) { A.plan = 'attack'; A.planT = rand(0.25, 0.55); }
  else if (rr < A.aggr + 0.18) { A.plan = 'back'; A.planT = rand(0.2, 0.45); }
  else { A.plan = 'circle'; A.planT = rand(0.3, 0.8); A.circleDir = Math.random() < 0.5 ? 1 : -1; }
}

function aiPickAttack(f, d) {
  var r = Math.random();
  if (d > 1.7) return r < 0.45 ? 'kickL' : (r < 0.8 ? 'kickH' : 'punchH');
  if (d > 1.3) return r < 0.38 ? 'kickL' : (r < 0.76 ? 'punchL' : 'punchH');
  return r < 0.6 ? 'punchL' : (r < 0.86 ? 'punchH' : 'kickL');
}

function updateAI(f, o, dt) {
  var A = f.ai;
  var inp = f.input;
  inp.mx = 0; inp.mz = 0; inp.guard = false; inp.jump = false;
  inp.punchL = inp.punchH = inp.kickL = inp.kickH = inp.dodge = false;

  if (G.mode !== 'fight' || f.state === 'ko' || f.state === 'win' || f.hitstun > 0) return;

  var dx = o.x - f.x, dz = o.z - f.z;
  var d = Math.hypot(dx, dz) || 0.001;
  var nx = dx / d, nz = dz / d;

  A.t -= dt;
  if (A.t <= 0) { A.t = rand(0.1, 0.3); aiDecide(f, o); }
  A.planT -= dt;
  if (A.planT <= 0) { aiDecide(f, o); A.planT = rand(0.2, 0.5); }

  // 反应延迟后出招
  if (A.pending) {
    A.reactT -= dt;
    if (A.reactT <= 0) {
      tryAttack(f, A.pending);
      A.pending = null;
      A.plan = 'wait'; A.planT = rand(0.15, 0.35);
    }
  }

  switch (A.plan) {
    case 'chase':
      inp.mx = nx; inp.mz = nz;
      if (d < 2.0 && !A.pending && Math.random() < 0.06) {
        A.pending = aiPickAttack(f, d); A.reactT = A.react * rand(0.5, 1.1);
      }
      break;
    case 'back':
      inp.mx = -nx * 0.9; inp.mz = -nz * 0.9;
      break;
    case 'circle':
      inp.mx = -nz * (A.circleDir || 1) * 0.9 + nx * 0.15;
      inp.mz = nx * (A.circleDir || 1) * 0.9 + nz * 0.15;
      break;
    case 'guard':
      inp.guard = true;
      if (o.state !== 'attack') {
        A.plan = 'attack'; A.planT = 0.25;
        A.pending = aiPickAttack(f, d); A.reactT = A.react * 0.5;
      }
      break;
    case 'dodge':
      if (f.dodgeCd <= 0 && f.dodgeT <= 0) {
        inp.dodge = true;
        inp.mx = -nx; inp.mz = -nz;
      }
      A.plan = 'wait'; A.planT = 0.25;
      break;
    case 'attack':
      if (!A.pending && f.state !== 'attack') {
        A.pending = aiPickAttack(f, d);
        A.reactT = A.react * rand(0.6, 1.2);
      }
      if (d > 1.8) { inp.mx = nx * 0.7; inp.mz = nz * 0.7; }
      break;
    case 'wait':
    default:
      break;
  }
}

/* ============================================================
   12. 玩家输入 -> fighter.input
============================================================ */
function readPlayerInput(dt) {
  var inp = p.input;
  inp.punchL = inp.punchH = inp.kickL = inp.kickH = inp.dodge = inp.jump = false;

  var ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup']) iz += 1;
  if (keys['s'] || keys['arrowdown']) iz -= 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (touch.on) { ix = touch.x; iz = touch.y; }

  var sx = Math.sin(camYaw), cz = Math.cos(camYaw);
  var mx = sx * iz + (-cz) * ix;
  var mz = cz * iz + sx * ix;
  var l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  inp.mx = mx; inp.mz = mz;

  var k;
  for (k in KEYMAP) {
    if (justPressed[k]) tryAttack(p, KEYMAP[k]);
  }
  if (justPressed[' ']) { inp.jump = true; }
  if (justPressed['shift']) { inp.dodge = true; }
  inp.guard = !!(keys['l'] || tKeys['l']);

  if (inp.dodge && p.dodgeCd <= 0 && p.dodgeT <= 0 && p.hitstun <= 0 && p.dodgeRec <= 0 && G.mode === 'fight') {
    var dl = Math.hypot(mx, mz);
    if (dl > 0.15) { p.dodgeDX = mx / dl; p.dodgeDZ = mz / dl; }
    else { p.dodgeDX = -Math.sin(p.root.rotation.y); p.dodgeDZ = -Math.cos(p.root.rotation.y); }
    p.dodgeT = 0.46; p.dodgeCd = 0.95; p.invuln = 0.3;
    p.state = 'idle'; p.atk = null;
    SFX.dodge();
    spawnRing(p.x, 0.05, p.z, 0x7fd6ff, 1.2, true);
  } else inp.dodge = false;

  // AI 闪避
  if (e && e.input.dodge && e.dodgeCd <= 0 && e.dodgeT <= 0 && e.hitstun <= 0 && G.mode === 'fight') {
    var al = Math.hypot(e.input.mx, e.input.mz);
    if (al > 0.15) { e.dodgeDX = e.input.mx / al; e.dodgeDZ = e.input.mz / al; }
    else { e.dodgeDX = -Math.sin(e.root.rotation.y); e.dodgeDZ = -Math.cos(e.root.rotation.y); }
    e.dodgeT = 0.46; e.dodgeCd = 1.3; e.invuln = 0.26;
    e.state = 'idle'; e.atk = null;
    SFX.dodge();
    spawnRing(e.x, 0.05, e.z, 0xffb0a0, 1.2, true);
  }
}

/* ============================================================
   13. 相机
============================================================ */
var camPos = new T.Vector3(0, 6, 12), camLook = new T.Vector3(0, 1.3, 0);
function updateCamera(dt, snap) {
  var ax = e ? e.x - p.x : 1, az = e ? e.z - p.z : 0;
  var d = Math.hypot(ax, az);
  var wantYaw = (d > 0.7 ? Math.atan2(ax, az) + Math.PI / 2 : camYaw) + camOffset;
  if (snap) camYaw = wantYaw;
  else {
    var diff = wrapPI(wantYaw - camYaw);
    var maxStep = 1.6 * dt;
    var step = diff * (1 - Math.exp(-2.6 * dt));
    if (step > maxStep) step = maxStep; else if (step < -maxStep) step = -maxStep;
    camYaw += step;
  }

  var midX = e ? (p.x + e.x) * 0.5 : p.x;
  var midZ = e ? (p.z + e.z) * 0.5 : p.z;
  var midY = e ? (p.y + e.y) * 0.5 : p.y;

  var wantDist = clamp(6.4 + d * 0.62, 8.2, 14.5) * camZoom;
  var wantH = 2.5 + d * 0.2 + midY * 0.5;
  camDist = snap ? wantDist : damp(camDist, wantDist, 3, dt);
  camHeight = snap ? wantH : damp(camHeight, wantH, 3, dt);

  var sx = Math.sin(camYaw), cz = Math.cos(camYaw);
  var tx = midX - sx * camDist;
  var tz = midZ - cz * camDist;
  var ty = camHeight;

  if (snap) camPos.set(tx, ty, tz);
  else {
    camPos.x = damp(camPos.x, tx, 7, dt);
    camPos.y = damp(camPos.y, ty, 6, dt);
    camPos.z = damp(camPos.z, tz, 7, dt);
  }

  var lx = midX, lz = midZ, ly = 1.25 + midY * 0.7;
  if (snap) camLook.set(lx, ly, lz);
  else {
    camLook.x = damp(camLook.x, lx, 9, dt);
    camLook.y = damp(camLook.y, ly, 8, dt);
    camLook.z = damp(camLook.z, lz, 9, dt);
  }

  camera.position.copy(camPos);
  if (shake > 0.001) {
    camera.position.x += rand(-1, 1) * shake * 0.42;
    camera.position.y += rand(-1, 1) * shake * 0.34;
    camera.position.z += rand(-1, 1) * shake * 0.42;
    shake = Math.max(0, shake - dt * 3.4);
  }
  camera.lookAt(camLook);
}

/* ============================================================
   14. UI / 流程
============================================================ */
var G = {
  mode: 'menu', clock: 0, timeLeft: 60, roundTime: 60,
  stage: 0, diff: 0, hitstop: 0, slowmo: 1,
  introT: 0, endT: 0, result: '',
  stats: { hits: 0, maxCombo: 0, parries: 0, time: 0 }
};

function setHP(f, v) { f.hp = clamp(v, 0, f.maxHp); }

function showCombo(n) {
  var el = $('combo');
  el.innerHTML = n + '<small>HIT COMBO</small>';
  el.classList.add('on');
  clearTimeout(showCombo._t);
  showCombo._t = setTimeout(function () { el.classList.remove('on'); }, 1200);
}
function banner(text, scale) {
  var el = $('banner');
  el.textContent = text;
  el.style.fontSize = (96 * (scale || 1)) + 'px';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function disposeFighter(f) {
  if (!f) return;
  f.root.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
      else o.material.dispose();
    }
  });
  scene.remove(f.root);
}
function spawnFoe(idx) {
  if (e) disposeFighter(e);
  var cfg = FOES[Math.min(idx, FOES.length - 1)];
  var diff = DIFF[G.diff];
  var c = {};
  for (var k in cfg) c[k] = cfg[k];
  c.hp = Math.round(cfg.hp * diff.hpMul);
  e = createFighter(c);
  e.ai.react = diff.react;
  e.ai.aggr = diff.aggr;
  e.ai.block = diff.block;
  e.dmgMul = diff.dmg;
  e.speedMul = diff.spd;
  e.maxHp = c.hp; e.hp = c.hp; e.hpDelay = 1;
  $('p2Name').textContent = c.name;
  $('p2Sub').textContent = cfg.tag + ' · ' + diff.label;
  return e;
}

function resetRound(full) {
  p.x = -3.4; p.z = 0; p.y = 0; p.vx = p.vz = p.vy = 0;
  p.state = 'idle'; p.atk = null; p.hitstun = 0; p.dodgeT = 0; p.dodgeRec = 0;
  p.dodgeCd = 0; p.invuln = 0; p.combo = 0; p.guarding = false; p.airUsed = false;
  p.rig.rotation.set(0, 0, 0); p.rig.position.set(0, 0, 0);
  p.root.rotation.y = Math.PI / 2;
  if (full) { p.maxHp = 100; p.hp = 100; p.hpDelay = 1; }
  else { p.hp = p.maxHp; p.hpDelay = 1; }

  e.x = 3.4; e.z = 0; e.y = 0; e.vx = e.vz = e.vy = 0;
  e.state = 'idle'; e.atk = null; e.hitstun = 0; e.dodgeT = 0; e.dodgeRec = 0;
  e.dodgeCd = 0; e.invuln = 0; e.combo = 0; e.guarding = false; e.airUsed = false;
  e.rig.rotation.set(0, 0, 0); e.rig.position.set(0, 0, 0);
  e.root.rotation.y = -Math.PI / 2;

  G.timeLeft = G.roundTime;
  G.stats = { hits: 0, maxCombo: 0, parries: 0, time: 0 };
  G.slowmo = 1; G.hitstop = 0; shake = 0;
  updateCamera(0.016, true);
}

function startGame(diff) {
  SFX.ensure();
  G.diff = diff;
  G.stage = 0;
  G.mode = 'intro';
  G.introT = 2.2;
  spawnFoe(0);
  resetRound(true);
  $('startScreen').classList.add('hidden');
  $('endScreen').classList.add('hidden');
  $('hud').classList.add('on');
  $('roundLabel').textContent = '第 1 场';
  $('stageLabel').textContent = FOES[0].tag;
  $('p1Sub').textContent = '连胜 0';
  $('p1Name').textContent = '挑战者';
  banner('READY', 1);
  setTimeout(function () { if (G.mode === 'intro') { banner('FIGHT!', 1.1); SFX.bell(1046); } }, 1500);
}

function nextFoe() {
  G.stage++;
  if (G.stage >= FOES.length) G.stage = 0;
  spawnFoe(G.stage);
  G.mode = 'intro'; G.introT = 2.2;
  resetRound(true);
  $('endScreen').classList.add('hidden');
  $('roundLabel').textContent = '第 ' + (G.stage + 1) + ' 场';
  $('stageLabel').textContent = FOES[G.stage].tag;
  $('p1Sub').textContent = '连胜 ' + G.stage;
  banner('READY', 1);
  setTimeout(function () { if (G.mode === 'intro') { banner('FIGHT!', 1.1); SFX.bell(1046); } }, 1500);
}

function retry() {
  spawnFoe(G.stage);
  G.mode = 'intro'; G.introT = 2.2;
  resetRound(true);
  $('endScreen').classList.add('hidden');
  $('roundLabel').textContent = '第 ' + (G.stage + 1) + ' 场';
  banner('READY', 1);
  setTimeout(function () { if (G.mode === 'intro') { banner('FIGHT!', 1.1); SFX.bell(1046); } }, 1500);
}

function endFight(playerWon) {
  G.mode = 'ko';
  G.endT = 2.4;
  G.result = playerWon ? 'win' : 'lose';
  G.slowmo = 0.32;
  hitstop(0.2);
  addShake(0.9);
  flashScreen(0.4);
  SFX.ko();
  var loser = playerWon ? e : p;
  var winner = playerWon ? p : e;
  loser.state = 'ko'; loser.koT = 0; loser.atk = null; loser.hitstun = 0;
  winner.state = 'win';
  banner('K.O.', 1.25);
  spawnRing(loser.x, 1.2, loser.z, 0xffffff, 2.4);
  spawnSparks(loser.x, 1.3, loser.z, 0xffc24d, 26, 1.6);
}

function showResult() {
  G.mode = 'result';
  G.slowmo = 1;
  var won = G.result === 'win';
  var t = $('resTitle');
  t.textContent = won ? '胜 利' : '失 败';
  t.className = won ? 'win' : 'lose';
  $('resSub').textContent = won
    ? ('击败了「' + e.name + '」' + (G.stage >= FOES.length - 1 ? ' —— 你就是新的无冕之王！' : '，下一位对手已在等候'))
    : ('败给了「' + e.name + '」，再来一次');
  $('stHits').textContent = G.stats.hits;
  $('stCombo').textContent = G.stats.maxCombo;
  $('stParry').textContent = G.stats.parries;
  $('stTime').textContent = Math.round(G.stats.time);
  var btnNext = $('btnNext');
  if (won && G.stage < FOES.length - 1) { btnNext.style.display = ''; btnNext.textContent = '挑战下一位'; }
  else if (won) { btnNext.style.display = ''; btnNext.textContent = '再战一轮'; }
  else { btnNext.style.display = 'none'; }
  $('endScreen').classList.remove('hidden');
}

function toMenu() {
  G.mode = 'menu';
  if (e) resetRound(true);
  p.state = 'idle'; p.atk = null; p.koT = 0;
  e.state = 'idle'; e.atk = null; e.koT = 0;
  $('startScreen').classList.remove('hidden');
  $('endScreen').classList.add('hidden');
  $('pauseScreen').classList.add('hidden');
  $('hud').classList.remove('on');
}

function updateHUD() {
  var pf = $('p1Fill'), pd = $('p1Delay'), ef = $('p2Fill'), ed = $('p2Delay');
  var pr = clamp(p.hp / p.maxHp, 0, 1), er = clamp(e ? e.hp / e.maxHp : 1, 0, 1);
  p.hpDelay = p.hpDelay < pr ? pr : Math.max(pr, p.hpDelay - 0.006);
  if (e) e.hpDelay = e.hpDelay < er ? er : Math.max(er, e.hpDelay - 0.006);
  pf.style.transform = 'scaleX(' + pr + ')';
  pd.style.transform = 'scaleX(' + p.hpDelay + ')';
  ef.style.transform = 'scaleX(' + er + ')';
  ed.style.transform = 'scaleX(' + (e ? e.hpDelay : 1) + ')';
  pf.classList.toggle('low', pr <= 0.25);
  ef.classList.toggle('low', er <= 0.25);

  var tm = Math.max(0, Math.ceil(G.timeLeft));
  var el = $('timer');
  el.textContent = tm < 10 ? '0' + tm : '' + tm;
  el.classList.toggle('warn', tm <= 10);
}

/* ============================================================
   15. 按钮
============================================================ */
(function bindUI() {
  var curDiff = 0;
  var row = $('diffRow');
  row.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.classList.contains('diff')) return;
    curDiff = parseInt(t.getAttribute('data-d'), 10) || 0;
    var all = row.querySelectorAll('.diff');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('sel', all[i] === t);
    SFX.ensure(); SFX.ui();
  });
  $('btnStart').addEventListener('click', function () { SFX.ui(); startGame(curDiff); });
  $('btnNext').addEventListener('click', function () { SFX.ui(); nextFoe(); });
  $('btnRetry').addEventListener('click', function () { SFX.ui(); retry(); });
  $('btnResume').addEventListener('click', function () { SFX.ui(); G.mode = 'fight'; $('pauseScreen').classList.add('hidden'); });
  $('btnQuit').addEventListener('click', function () { SFX.ui(); toMenu(); });
})();

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

/* ============================================================
   16. 主循环
============================================================ */
var last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  var raw = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 触屏控件只在战斗/过场/击倒时显示，避免遮挡菜单与结算面板
  if (touchEl) touchEl.classList.toggle('on', G.mode === 'fight' || G.mode === 'intro' || G.mode === 'ko');

  var dt = raw;
  if (G.hitstop > 0) { G.hitstop -= raw; dt = raw * 0.05; }
  dt *= G.slowmo;

  // 暂停快捷键
  if (justPressed['p'] || justPressed['escape']) togglePause();
  if (justPressed['m']) { SFX.ensure(); var m = SFX.toggle(); banner(m ? '静音' : '音效开', 0.5); }
  if (justPressed['r'] && (G.mode === 'result' || G.mode === 'fight' || G.mode === 'ko')) { retry(); }

  if (G.mode === 'pause') {
    justPressed = {};
    renderer.render(scene, camera);
    return;
  }

  G.clock += raw;

  if (G.mode === 'menu') {
    // 菜单：环绕运镜
    var t = G.clock * 0.12;
    camera.position.set(Math.cos(t) * 15, 6.5 + Math.sin(t * 0.7) * 1.6, Math.sin(t) * 15);
    camera.lookAt(0, 1.4, 0);
    p.root.position.set(-2.7, 0, 0); p.root.rotation.y = Math.PI / 2;
    e.root.position.set(2.7, 0, 0); e.root.rotation.y = -Math.PI / 2;
    p.vx = p.vz = 0; e.vx = e.vz = 0;
    basePose(p, raw);
    basePose(e, raw);
    updateFx(raw);
    renderer.render(scene, camera);
    justPressed = {};
    return;
  }

  if (G.mode === 'intro') {
    G.introT -= raw;
    if (G.introT <= 0) { G.mode = 'fight'; }
  }

  // 读取输入
  readPlayerInput(raw);
  if (G.mode === 'fight' && e) updateAI(e, p, raw);

  // 时间
  if (G.mode === 'fight') {
    G.timeLeft -= raw;
    G.stats.time += raw;
    if (G.timeLeft <= 0) {
      G.timeLeft = 0;
      var pw = p.hp / p.maxHp >= (e.hp / e.maxHp);
      banner('TIME UP', 0.85);
      endFight(pw);
    }
  }

  if (G.mode === 'ko') {
    G.endT -= raw;
    if (p.state === 'ko') p.koT += raw;
    if (e.state === 'ko') e.koT += raw;
    G.slowmo = damp(G.slowmo, 1, 1.4, raw);
    if (G.endT <= 0) showResult();
  }

  // 更新
  updateFighter(p, e, dt);
  if (e) updateFighter(e, p, dt);
  if (e) separate(p, e);

  basePose(p, dt);
  if (e) basePose(e, dt);

  // 判定放在姿势更新之后：画面上拳脚到哪，就打到哪
  checkHit(p, e);
  if (e) checkHit(e, p);

  // 胜负判定
  if (G.mode === 'fight') {
    if (p.hp <= 0) endFight(false);
    else if (e.hp <= 0) endFight(true);
  }

  updateCamera(raw, false);
  updateFx(raw);
  updateHUD();

  SFX.music(raw, G.mode === 'fight' ? clamp(1 - Math.min(p.hp / p.maxHp, e.hp / e.maxHp), 0, 1) : 0);

  renderer.render(scene, camera);
  justPressed = {};
}

/* 初始化一次，让菜单有内容 */
(function init() {
  e = spawnEnemyForMenu();
  resetRound(true);
  G.mode = 'menu';
  updateCamera(0.016, true);
  $('boot').classList.add('hidden');
  requestAnimationFrame(frame);
})();

function spawnEnemyForMenu() {
  return spawnFoe(0);
}

};
