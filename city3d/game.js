/* 迷你模拟城市 3D —— 基于 three.js 的网页城市建造小游戏 */
(function () {
  'use strict';
  const THREE = window.THREE;
  const $ = function (id) { return document.getElementById(id); };

  // 出错时在启动遮罩上显示原因，避免“点了没反应却看不到报错”
  function fatal(msg) {
    var b = $('boot');
    if (!b) return;
    b.dataset.fatal = '1';
    var p = b.querySelector('p'); if (p) p.textContent = '启动失败：' + msg;
    var g = b.querySelector('.go'); if (g) g.style.display = 'none';
    var hud = $('hud'); if (hud) hud.style.display = 'none';
  }
  window.addEventListener('error', function (e) { fatal((e && e.message) || '脚本运行出错'); });

  if (!THREE) { fatal('three.js 未加载，请确认 vendor/three.min.js 与本页面在同一目录'); return; }
  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ============================ 配置 ============================ */
  const N = 40;                 // 网格 40 x 40
  const CELL = 2;               // 每格边长
  const HALF = N * CELL / 2;
  const MAXL = 5;               // 最高等级

  const DEF = {
    road:        { name: '道路',   cost: 120,  upkeep: 2,   color: '#5b6472' },
    residential: { name: '住宅区', cost: 600,  upkeep: 6,   color: '#d9a866' },
    commercial:  { name: '商业区', cost: 900,  upkeep: 10,  color: '#5aa9e6' },
    industrial:  { name: '工业区', cost: 1300, upkeep: 18,  color: '#98a1ab' },
    park:        { name: '公园',   cost: 350,  upkeep: 4,   color: '#4caf50' },
    power:       { name: '发电厂', cost: 5000, upkeep: 250, color: '#ef5da8' },
    bulldoze:    { name: '拆除',   cost: 0,    upkeep: 0,   color: '#ff6b6b' }
  };
  const ORDER = ['road', 'residential', 'commercial', 'industrial', 'park', 'power', 'bulldoze'];
  const ZONE = { residential: 1, commercial: 1, industrial: 1 };

  const POWER_PER_PLANT = 400;
  const USE = { residential: 4, commercial: 8, industrial: 18, park: 1, road: 0, power: 0 };

  const state = {
    money: 26000, pop: 0, satisfaction: 62, tax: 0.09,
    day: 1, hour: 6, speed: 1, paused: false,
    tool: null, net: 0, jobs: 0, cap: 0, powerUse: 0, powerSup: 0, powered: true
  };

  const tiles = new Array(N * N).fill(null);
  const idx = function (x, z) { return z * N + x; };
  const inMap = function (x, z) { return x >= 0 && z >= 0 && x < N && z < N; };
  const isWater = function (x, z) { return x >= 30 && x <= 36 && z >= 5 && z <= 14; };
  const worldX = function (x) { return -HALF + x * CELL + CELL / 2; };
  const worldZ = function (z) { return -HALF + z * CELL + CELL / 2; };

  /* ========================== 场景搭建 ========================== */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ecdf5);
  scene.fog = new THREE.Fog(0x9ecdf5, 90, 190);

  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 500);
  const cam = { tx: 0, tz: 0, r: 62, theta: -0.9, phi: 0.92 };
  function syncCam() {
    cam.r = clamp(cam.r, 14, 150);
    cam.phi = clamp(cam.phi, 0.18, 1.42);
    camera.position.set(
      cam.tx + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta),
      cam.r * Math.cos(cam.phi),
      cam.tz + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta)
    );
    camera.lookAt(cam.tx, 0, cam.tz);
    camera.updateMatrixWorld();
  }
  syncCam();

  const UP = new THREE.Vector3(0, 1, 0);
  const _f = new THREE.Vector3(), _r = new THREE.Vector3();
  function panScreen(dx, dy) {
    camera.getWorldDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1);
    _f.normalize();
    _r.crossVectors(_f, UP).normalize();
    const s = cam.r * 0.0016;
    cam.tx = clamp(cam.tx + (-_r.x * dx + _f.x * dy) * s, -HALF - 20, HALF + 20);
    cam.tz = clamp(cam.tz + (-_r.z * dx + _f.z * dy) * s, -HALF - 20, HALF + 20);
    syncCam();
  }

  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a5a3c, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 220;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0009;
  scene.add(sun);
  scene.add(sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.28);
  scene.add(amb);

  // 地面
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x3d5c39 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.06;
  outer.receiveShadow = true;
  scene.add(outer);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(N * CELL, N * CELL),
    new THREE.MeshLambertMaterial({ color: 0x4b7a45 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(N * CELL, N, 0x000000, 0x000000);
  grid.material.opacity = 0.13;
  grid.material.transparent = true;
  grid.position.y = 0.012;
  scene.add(grid);

  // 湖
  (function makeLake() {
    const x0 = 30, x1 = 36, z0 = 5, z1 = 14;
    const w = (x1 - x0 + 1) * CELL, d = (z1 - z0 + 1) * CELL;
    const cx = (worldX(x0) + worldX(x1)) / 2, cz = (worldZ(z0) + worldZ(z1)) / 2;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color: 0x2f7fbf, transparent: true, opacity: 0.9 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.03, cz);
    scene.add(water);
    const bank = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.7, d + 0.7),
      new THREE.MeshLambertMaterial({ color: 0x8d7f5e })
    );
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(cx, 0.02, cz);
    scene.add(bank);
  })();

  /* ========================= 纹理与材质 ========================= */
  function canvasTex(draw) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    draw(c.getContext('2d'), 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 建筑立面：底图 + 自发光图（夜里窗户亮）
  function facadePair(base, win, floors, cols, band) {
    const S = 128;
    const mk = function (bg, fg) {
      return canvasTex(function (g) {
        g.fillStyle = bg; g.fillRect(0, 0, S, S);
        if (band) {
          g.fillStyle = 'rgba(0,0,0,.16)';
          for (let j = 0; j <= floors; j++) g.fillRect(0, j * (S / floors) - 2, S, 4);
        }
        const cw = S / cols, ch = S / floors;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < floors; j++) {
            const x = i * cw + cw * 0.22, y = j * ch + ch * 0.24;
            const w = cw * 0.56, h = ch * 0.40;
            g.fillStyle = fg; g.fillRect(x, y, w, h);
            g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, w, h * 0.34);
          }
        }
      });
    };
    return { map: mk(base, win), emi: mk('#000000', '#ffffff') };
  }

  const matCache = {};
  const facadeMats = [];
  function facadeMat(type, level, variant) {
    const key = (type === 'industrial' ? 'ind_' : type + level + '_') + variant;
    if (matCache[key]) return matCache[key];
    let pair, floors, cols;
    if (type === 'residential') {
      const base = ['#d8b489', '#c8a077', '#e2c9a4'][variant % 3];
      floors = Math.max(2, level + 1); cols = 3;
      pair = facadePair(base, '#79aecd', floors, cols, true);
    } else if (type === 'commercial') {
      const base = ['#5b7f9e', '#48688a', '#6d90ad'][variant % 3];
      floors = level + 2; cols = 4;
      pair = facadePair(base, '#a8dcff', floors, cols, false);
    } else {
      const base = ['#9aa1a8', '#8b939b'][variant % 2];
      floors = 2; cols = 4;
      pair = facadePair(base, '#6f7b86', floors, cols, true);
    }
    const m = new THREE.MeshLambertMaterial({
      map: pair.map, emissiveMap: pair.emi,
      emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0.05
    });
    matCache[key] = m;
    facadeMats.push(m);
    return m;
  }

  const solid = {};
  function solidMat(hex) {
    if (!solid[hex]) solid[hex] = new THREE.MeshLambertMaterial({ color: hex });
    return solid[hex];
  }
  const ROAD_MAT = new THREE.MeshLambertMaterial({ color: 0x3b4048 });
  const MARK_MAT = new THREE.MeshLambertMaterial({ color: 0xd8d3bd });
  const LEAF = [0x3f8f42, 0x4aa04d, 0x358038];

  /* ========================= 建筑生成 ========================= */
  function hash(x, z, k) {
    let h = (x * 73856093) ^ (z * 19349663) ^ (k * 83492791);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function buildMesh(type, level, x, z) {
    const g = new THREE.Group();
    const v = Math.floor(hash(x, z, 7) * 3);
    if (type === 'residential') {
      const h = 1.1 + level * 1.05;
      g.add(box(1.5, h, 1.5, facadeMat('residential', level, v), 0, h / 2, 0));
      if (level <= 2) {
        const r = new THREE.Mesh(new THREE.ConeGeometry(1.24, 0.7, 4), solidMat(0x8b4638));
        r.rotation.y = Math.PI / 4; r.position.y = h + 0.34; r.castShadow = true;
        g.add(r);
      } else {
        g.add(box(1.56, 0.14, 1.56, solidMat(0x6d5b4a), 0, h + 0.07, 0));
        if (level >= 4) g.add(box(0.4, 0.3, 0.4, solidMat(0x777777), 0.4, h + 0.28, -0.4));
      }
    } else if (type === 'commercial') {
      const h = 1.5 + level * 1.85;
      g.add(box(1.34, h, 1.34, facadeMat('commercial', level, v), 0, h / 2, 0));
      g.add(box(1.42, 0.16, 1.42, solidMat(0x39424d), 0, h + 0.08, 0));
      if (level >= 3) {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), solidMat(0x555f6b));
        a.position.y = h + 0.6; g.add(a);
      }
      if (level >= 5) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff5a5a }));
        l.position.y = h + 1.07; g.add(l);
        g.userData.beacon = l;
      }
    } else if (type === 'industrial') {
      const h = 1.4 + level * 0.42;
      g.add(box(1.72, h, 1.72, facadeMat('industrial', level, v), 0, h / 2, 0));
      g.add(box(1.78, 0.16, 1.78, solidMat(0x5d646c), 0, h + 0.08, 0));
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.5 + level * 0.35, 10), solidMat(0x6b7078));
      ch.position.set(0.58, h / 2 + (1.5 + level * 0.35) / 2, -0.58);
      ch.castShadow = true; g.add(ch);
      if (level >= 3) {
        const ch2 = ch.clone(); ch2.position.x = -0.58; ch2.scale.y = 0.8; ch2.position.y = h / 2 + (1.5 + level * 0.35) * 0.4;
        g.add(ch2);
      }
    } else if (type === 'park') {
      g.add(box(1.94, 0.09, 1.94, solidMat(0x3f8a3c), 0, 0.045, 0));
      const path = box(1.5, 0.03, 0.34, solidMat(0xb59a72), 0, 0.1, 0.5);
      g.add(path);
      const n = 3 + Math.floor(hash(x, z, 3) * 3);
      for (let i = 0; i < n; i++) {
        const rx = (hash(x, z, 11 + i) - 0.5) * 1.3;
        const rz = (hash(x, z, 31 + i) - 0.5) * 1.3;
        const th = 0.45 + hash(x, z, 51 + i) * 0.3;
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, th * 0.5, 5), solidMat(0x6b4b2f));
        tr.position.set(rx, 0.09 + th * 0.25, rz); tr.castShadow = true; g.add(tr);
        const cr = new THREE.Mesh(new THREE.ConeGeometry(0.3, th * 1.5, 7), solidMat(LEAF[i % 3]));
        cr.position.set(rx, 0.09 + th * 0.5 + th * 0.75, rz); cr.castShadow = true; g.add(cr);
      }
    } else if (type === 'power') {
      g.add(box(1.6, 0.95, 1.6, solidMat(0x575e66), 0, 0.48, 0));
      for (let i = 0; i < 2; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.95, 14), solidMat(0xb8bcc2));
        t.position.set(i ? 0.42 : -0.42, 0.48, -0.5); t.castShadow = true; g.add(t);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 14), solidMat(0xd0464f));
        cap.position.set(i ? 0.42 : -0.42, 0.99, -0.5); g.add(cap);
      }
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.1, 10), solidMat(0x8a8f96));
      st.position.set(0.55, 1.05, 0.5); st.castShadow = true; g.add(st);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      b.position.set(0.55, 2.15, 0.5); g.add(b);
      g.userData.beacon = b;
    }
    g.position.set(worldX(x), 0, worldZ(z));
    return g;
  }

  function roadMesh(x, z) {
    const g = new THREE.Group();
    const base = box(CELL, 0.09, CELL, ROAD_MAT, 0, 0.045, 0);
    base.castShadow = false;
    g.add(base);
    const n = hasRoad(x, z - 1), s = hasRoad(x, z + 1), w = hasRoad(x - 1, z), e = hasRoad(x + 1, z);
    if (n || s) {
      for (let i = -1; i <= 1; i++) g.add(box(0.1, 0.02, 0.7, MARK_MAT, 0, 0.1, i * 0.62));
    }
    if (w || e) {
      for (let i = -1; i <= 1; i++) g.add(box(0.7, 0.02, 0.1, MARK_MAT, i * 0.62, 0.1, 0));
    }
    if (!n && !s && !w && !e) g.add(box(0.34, 0.02, 0.34, MARK_MAT, 0, 0.1, 0));
    g.position.set(worldX(x), 0, worldZ(z));
    return g;
  }
  function hasRoad(x, z) {
    if (!inMap(x, z)) return false;
    const t = tiles[idx(x, z)];
    return !!(t && t.type === 'road');
  }
  function nearRoad(x, z) {
    return hasRoad(x - 1, z) || hasRoad(x + 1, z) || hasRoad(x, z - 1) || hasRoad(x, z + 1);
  }

  /* ========================= 建造 / 拆除 ========================= */
  function disposeGroup(g) {
    g.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
    scene.remove(g);
  }
  function refreshRoadLook(x, z) {
    const t = inMap(x, z) && tiles[idx(x, z)];
    if (t && t.type === 'road') {
      disposeGroup(t.group);
      t.group = roadMesh(x, z);
      scene.add(t.group);
    }
  }

  function place(x, z, type) {
    if (!inMap(x, z)) return;
    if (isWater(x, z)) { toast('这里是湖面，不能建造', 'err'); return; }
    const cur = tiles[idx(x, z)];
    if (cur) {
      if (type === 'bulldoze') return remove(x, z);
      if (cur.type === type) return;
      toast('这格已经有建筑了', 'err');
      return;
    }
    if (type === 'bulldoze') return;
    const d = DEF[type];
    if (state.money < d.cost) { toast('资金不足，需要 ¥' + d.cost, 'err'); return; }

    state.money -= d.cost;
    const t = { type: type, level: 1, x: x, z: z, powered: false, road: false, group: null };
    t.group = (type === 'road') ? roadMesh(x, z) : buildMesh(type, 1, x, z);
    scene.add(t.group);
    tiles[idx(x, z)] = t;

    refreshRoadLook(x - 1, z); refreshRoadLook(x + 1, z);
    refreshRoadLook(x, z - 1); refreshRoadLook(x, z + 1);
    simTick(true);
    refreshUI();
  }

  function remove(x, z) {
    const t = inMap(x, z) && tiles[idx(x, z)];
    if (!t) return;
    const back = Math.round(DEF[t.type].cost * 0.4 * (t.type === 'road' ? 1 : t.level * 0.6 + 0.4));
    state.money += back;
    disposeGroup(t.group);
    tiles[idx(x, z)] = null;
    refreshRoadLook(x - 1, z); refreshRoadLook(x + 1, z);
    refreshRoadLook(x, z - 1); refreshRoadLook(x, z + 1);
    simTick(true);
    refreshUI();
    toast('拆除完成，回收 ¥' + back);
  }

  function setLevel(t, lv) {
    t.level = lv;
    disposeGroup(t.group);
    t.group = buildMesh(t.type, lv, t.x, t.z);
    scene.add(t.group);
  }

  /* ========================= 模拟 ========================= */
  const pollGrid = new Float32Array(N * N);
  const parkGrid = new Float32Array(N * N);
  let warnTick = 0;

  function simTick(silent) {
    let sup = 0, need = 0, cap = 0, jobs = 0;
    let resL = 0, comL = 0, indL = 0, upkeep = 0, roadCount = 0;
    const list = [];    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (!t) continue;
      list.push(t);
      upkeep += DEF[t.type].upkeep * (ZONE[t.type] ? t.level : 1);
      if (t.type === 'power') sup += POWER_PER_PLANT;
      if (t.type === 'road') roadCount++;
      if (ZONE[t.type]) {
        t.road = nearRoad(t.x, t.z);
        if (t.road) {
          need += USE[t.type] * t.level;
          if (t.type === 'residential') { cap += t.level * 12; }
          if (t.type === 'commercial') { jobs += t.level * 8; comL += t.level; }
          if (t.type === 'industrial') { jobs += t.level * 16; indL += t.level; }
        }
      } else if (t.type !== 'road') {
        need += USE[t.type] || 0;
      }
    }
    const powered = sup >= need;
    for (let i = 0; i < list.length; i++) list[i].powered = powered;

    // 污染与公园覆盖
    pollGrid.fill(0); parkGrid.fill(0);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.type === 'industrial') {
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
          const x = t.x + dx, z = t.z + dz;
          if (inMap(x, z)) pollGrid[idx(x, z)] += t.level * (1 - (Math.abs(dx) + Math.abs(dz)) / 8);
        }
      } else if (t.type === 'park') {
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const x = t.x + dx, z = t.z + dz;
          if (inMap(x, z)) parkGrid[idx(x, z)] += 1 - (Math.abs(dx) + Math.abs(dz)) / 5;
        }
      }
    }
    let poll = 0, park = 0, resN = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.type === 'residential') { resN++; poll += clamp(pollGrid[idx(t.x, t.z)] / 4, 0, 1); park += clamp(parkGrid[idx(t.x, t.z)] / 3, 0, 1); }
    }
    const pollIdx = resN ? poll / resN : 0;
    const parkIdx = resN ? park / resN : 0;

    // 满意度
    let target = 54;
    target += parkIdx * 22;
    target += powered ? 8 : -28;
    target += (pop0 >= 8 && jobs >= pop0 * 0.42) ? 10 : (pop0 >= 8 ? -12 : 0);
    target -= (state.tax - 0.08) * 150;
    target -= pollIdx * 38;
    if (state.money < 0) target -= 16;
    if (cap === 0) target = 60;
    target = clamp(target, 0, 100);
    state.satisfaction = silent ? target : lerp(state.satisfaction, target, 0.18);
    const sat = state.satisfaction;

    // 人口
    const capAvail = cap;
    let popTarget = capAvail * (0.35 + 0.65 * sat / 100);
    if (popTarget > jobs * 2.4 + 12) popTarget = jobs * 2.4 + 12;
    if (!powered && capAvail > 0) popTarget *= 0.4;
    state.pop = clamp(lerp(state.pop, popTarget, silent ? 0.25 : 0.07), 0, 1e9);
    pop0 = state.pop;

    // 收支
    const eff = powered ? 1 : 0.35;
    const taxIn = state.pop * 2.6 * (state.tax / 0.09) * eff;
    const comIn = comL * 45 * clamp(state.pop / (comL * 18 + 1), 0, 1) * eff;
    const indIn = indL * 70 * clamp(0.35 + state.pop / (indL * 25 + 1), 0, 1.2) * eff;
    const income = taxIn + comIn + indIn;
    state.net = income - upkeep;
    if (!silent) state.money += state.net;

    state.cap = cap; state.jobs = jobs;
    state.powerUse = need; state.powerSup = sup; state.powered = powered;

    // 生长与衰败
    if (!silent && list.length) {
      const zones = list.filter(function (t) { return ZONE[t.type]; });
      const tries = Math.min(12, zones.length);
      for (let k = 0; k < tries; k++) {
        const t = zones[Math.floor(Math.random() * zones.length)];
        if (!t.road || !powered) continue;
        if (sat >= 46 && t.level < MAXL) {
          let ok = false;
          if (t.type === 'residential') ok = state.pop >= cap * 0.8 && cap > 0;
          if (t.type === 'commercial') ok = state.pop >= comL * 18 * 0.55;
          if (t.type === 'industrial') ok = state.pop >= indL * 25 * 0.5;
          if (ok && Math.random() < 0.5) { setLevel(t, t.level + 1); continue; }
        }
        if ((sat < 30 || !powered) && t.level > 1 && Math.random() < 0.12) setLevel(t, t.level - 1);
      }
    }

    // 提示
    if (!silent) {
      warnTick++;
      if (warnTick % 12 === 0) {
        if (!powered && need > 0) toast('电力不足！快建发电厂', 'err');
        else if (cap === 0 && resN > 0) toast('住宅区得挨着马路，不然没人搬进来', 'err');
        else if (sat < 35 && cap > 0) toast('市民不满：' + (pollIdx > 0.4 ? '污染严重' : (parkIdx < 0.15 ? '缺少公园' : '税率过高或岗位不足')), 'err');
        else if (cap > 0 && jobs < state.pop * 0.35) toast('岗位不足，建些商业区或工业区', 'err');
      }
      if (roadCount === 0 && list.length === 0 && warnTick === 8) toast('先修一条路，再在路边划住宅区');
    }
    roadCnt = roadCount;
    beacons.length = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t && t.group && t.group.userData.beacon) beacons.push(t.group.userData.beacon);
    }
    return { roadCount: roadCount };
  }
  let pop0 = 0;
  let roadCnt = 0;
  const beacons = [];

  function advanceTime() {
    state.hour++;
    if (state.hour >= 24) { state.hour = 0; state.day++; }
  }

  /* ========================= 光影 / 昼夜 ========================= */
  const SKY_DAY = new THREE.Color(0x9ecdf5);
  const SKY_DUSK = new THREE.Color(0xe8a86e);
  const SKY_NIGHT = new THREE.Color(0x0a1226);
  const tmpC = new THREE.Color();

  function updateSky(smoothHour) {
    const a = ((smoothHour - 6) / 24) * Math.PI * 2;
    const sy = Math.sin(a);
    const night = clamp(0.5 - sy * 1.25, 0, 1);
    let col;
    if (sy > 0.35) col = tmpC.copy(SKY_DAY);
    else if (sy > -0.12) col = tmpC.copy(SKY_DUSK).lerp(SKY_DAY, (sy + 0.12) / 0.47);
    else col = tmpC.copy(SKY_NIGHT).lerp(SKY_DUSK, clamp((sy + 0.7) / 0.58, 0, 1));
    scene.background = col.clone();
    scene.fog.color.copy(col);

    sun.position.set(Math.cos(a) * 70, Math.max(sy, -0.2) * 70 + 8, 34);
    sun.target.position.set(0, 0, 0);
    sun.intensity = lerp(0.12, 1.55, 1 - night);
    sun.color.setHSL(lerp(0.6, 0.11, 1 - night), lerp(0.55, 0.32, 1 - night), lerp(0.35, 0.62, 1 - night));
    hemi.intensity = lerp(0.18, 0.58, 1 - night);
    amb.intensity = lerp(0.14, 0.3, 1 - night);
    amb.color.setHSL(0.6, 0.4, lerp(0.35, 0.6, 1 - night));
    const ei = 0.04 + night * 1.0;
    for (let i = 0; i < facadeMats.length; i++) facadeMats[i].emissiveIntensity = ei;
    return night;
  }

  /* ========================= 车辆 ========================= */
  const cars = [];
  const CAR_COLORS = [0xe0503f, 0x3f7fe0, 0xf0c419, 0xe8e8e8, 0x5bbf6a, 0x8a5bd0];
  function roadTiles() {
    const out = [];
    for (let i = 0; i < tiles.length; i++) { const t = tiles[i]; if (t && t.type === 'road') out.push(t); }
    return out;
  }
  function spawnCar(rs) {
    if (!rs.length) return;
    const t = rs[Math.floor(Math.random() * rs.length)];
    const m = box(0.3, 0.24, 0.55, solidMat(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]),
      0, 0.2, 0);
    m.castShadow = true;
    const car = { mesh: m, x: t.x, z: t.z, tx: t.x, tz: t.z, p: 0, from: null };
    car.mesh.position.set(worldX(t.x), 0.2, worldZ(t.z));
    scene.add(m);
    cars.push(car);
    pickNext(car);
  }
  function pickNext(car) {
    const cand = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < 4; i++) {
      const x = car.x + dirs[i][0], z = car.z + dirs[i][1];
      if (hasRoad(x, z) && !(car.from && car.from[0] === x && car.from[1] === z)) cand.push([x, z]);
    }
    if (!cand.length) {
      for (let i = 0; i < 4; i++) {
        const x = car.x + dirs[i][0], z = car.z + dirs[i][1];
        if (hasRoad(x, z)) cand.push([x, z]);
      }
    }
    if (!cand.length) return false;
    const c = cand[Math.floor(Math.random() * cand.length)];
    car.from = [car.x, car.z];
    car.tx = c[0]; car.tz = c[1]; car.p = 0;
    car.mesh.rotation.y = Math.atan2(worldX(car.tx) - worldX(car.x), worldZ(car.tz) - worldZ(car.z));
    return true;
  }
  function updateCars(dt) {
    const want = Math.min(48, Math.floor(roadCountNow() / 5));
    if (cars.length < want) {
      const rs = roadTiles();
      while (cars.length < want && cars.length < 48) spawnCar(rs);
    }
    while (cars.length > want + 4) { const c = cars.pop(); scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      c.p += dt * 0.55;
      if (c.p >= 1) {
        c.x = c.tx; c.z = c.tz;
        if (!pickNext(c)) { scene.remove(c.mesh); c.mesh.geometry.dispose(); cars.splice(i, 1); continue; }
      }
      const t = Math.min(c.p, 1);
      c.mesh.position.x = lerp(worldX(c.x), worldX(c.tx), t);
      c.mesh.position.z = lerp(worldZ(c.z), worldZ(c.tz), t);
    }
  }
  function roadCountNow() { return roadCnt; }

  /* ========================= 幽灵预览 ========================= */
  const ghost = new THREE.Group();
  const ghostBox = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x4ea8ff, transparent: true, opacity: 0.42, depthWrite: false })
  );
  const ghostEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 })
  );
  ghost.add(ghostBox); ghost.add(ghostEdge);
  ghost.visible = false;
  scene.add(ghost);

  function ghostHeight(type) {
    if (type === 'road') return 0.12;
    if (type === 'park') return 0.6;
    if (type === 'power') return 2.2;
    if (type === 'industrial') return 1.9;
    if (type === 'commercial') return 3.4;
    return 2.2;
  }
  function updateGhost(x, z, ok) {
    if (!state.tool || !inMap(x, z)) { ghost.visible = false; return; }
    const h = ghostHeight(state.tool);
    ghost.visible = true;
    ghost.position.set(worldX(x), h / 2 + 0.02, worldZ(z));
    ghostBox.scale.set(CELL * 0.94, h, CELL * 0.94);
    ghostEdge.scale.set(CELL * 0.94, h, CELL * 0.94);
    const c = ok ? DEF[state.tool].color : '#ff5555';
    ghostBox.material.color.set(c);
  }

  /* ========================= 输入 ========================= */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverX = -1, hoverZ = -1;
  let drag = null, painting = false;

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(ground, false);
    if (!hit.length) return null;
    const p = hit[0].point;
    const gx = Math.floor((p.x + HALF) / CELL);
    const gz = Math.floor((p.z + HALF) / CELL);
    if (!inMap(gx, gz)) return null;
    return { x: gx, z: gz };
  }
  function canPlaceAt(x, z) {
    if (isWater(x, z)) return false;
    if (state.tool === 'bulldoze') return !!tiles[idx(x, z)];
    if (tiles[idx(x, z)]) return false;
    return state.money >= DEF[state.tool].cost;
  }

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // 多点触摸：单指建造/旋转，双指捏合缩放 + 旋转 + 平移
  const pts = new Map();
  let twoFinger = false, lastDist = 0, lastAngle = 0, lastMid = null;
  function pinch() {
    const a = Array.from(pts.values());
    if (a.length < 2) return null;
    const dx = a[1].x - a[0].x, dy = a[1].y - a[0].y;
    return {
      dist: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
      mid: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }
    };
  }
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {            // 双指：进入相机手势模式
      twoFinger = true; painting = false;
      const info = pinch();
      lastDist = info.dist; lastAngle = info.angle; lastMid = info.mid;
      return;
    }
    const p = pick(e);
    if (e.button === 2) { drag = { m: 'rot', x: e.clientX, y: e.clientY }; }
    else if (e.button === 1) { drag = { m: 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); }
    else if (e.button === 0 && p) {
      if (state.tool) {
        if (canPlaceAt(p.x, p.z)) {
          if (state.tool === 'bulldoze') remove(p.x, p.z); else place(p.x, p.z, state.tool);
        } else if (tiles[idx(p.x, p.z)] && state.tool !== 'bulldoze') toast('这里不能建造', 'err');
        painting = (state.tool === 'road' || state.tool === 'bulldoze');
      } else {
        drag = { m: 'rot', x: e.clientX, y: e.clientY };
      }
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (twoFinger && pts.size >= 2) {   // 双指相机手势
      const info = pinch();
      if (info) {
        cam.r *= lastDist / info.dist;                 // 捏合：分开=放大，合拢=缩小
        cam.theta -= (info.angle - lastAngle) * 1.3;   // 双指旋转视角
        if (lastMid) panScreen(info.mid.x - lastMid.x, info.mid.y - lastMid.y); // 双指平移
        syncCam();
        lastDist = info.dist; lastAngle = info.angle; lastMid = info.mid;
      }
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.m === 'rot') {
        cam.theta -= dx * 0.005;
        cam.phi -= dy * 0.004;
        syncCam();
      } else {
        panScreen(dx, dy);
      }
      return;
    }
    const p = pick(e);
    if (!p) { ghost.visible = false; hoverX = -1; hoverZ = -1; return; }
    hoverX = p.x; hoverZ = p.z;
    if (painting && state.tool && canPlaceAt(p.x, p.z)) {
      if (state.tool === 'bulldoze') remove(p.x, p.z); else place(p.x, p.z, state.tool);
    }
    updateGhost(p.x, p.z, canPlaceAt(p.x, p.z));
  });
  function endPointer(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) twoFinger = false;
    if (pts.size === 0) { drag = null; painting = false; }
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.r *= (1 + Math.sign(e.deltaY) * 0.12);
    syncCam();
  }, { passive: false });

  const keys = {};
  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k >= '1' && k <= '6') selectTool(ORDER[parseInt(k, 10) - 1]);
    else if (k === 'x') selectTool('bulldoze');
    else if (k === 'escape') selectTool(null);
    else if (k === ' ') { togglePause(); e.preventDefault(); }
    else if (k === 'q') { cam.theta += 0.08; syncCam(); }
    else if (k === 'e') { cam.theta -= 0.08; syncCam(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  /* ========================= UI ========================= */
  const moneyEl = $('s-money'), popEl = $('s-pop'), powEl = $('s-power'),
    satEl = $('s-sat'), timeEl = $('s-time');

  function fmt(n) {
    n = Math.round(n);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function refreshUI() {
    moneyEl.textContent = '¥' + fmt(state.money);
    moneyEl.style.color = state.money < 0 ? '#ff6b6b' : '';
    popEl.textContent = fmt(state.pop);
    powEl.innerHTML = fmt(state.powerUse) + '<small>/' + fmt(state.powerSup) + '</small>';
    powEl.style.color = state.powerUse > state.powerSup ? '#ff6b6b' : '';
    satEl.innerHTML = Math.round(state.satisfaction) + '<small>%</small>';
    satEl.style.color = state.satisfaction < 35 ? '#ff6b6b' : (state.satisfaction > 70 ? '#4ad991' : '');
    timeEl.textContent = '第' + state.day + '天 ' + (state.hour < 10 ? '0' : '') + state.hour + ':00';

    $('i-cap').textContent = fmt(state.cap);
    $('i-job').textContent = fmt(state.jobs);
    $('i-net').textContent = (state.net >= 0 ? '¥' : '-¥') + fmt(Math.abs(state.net));
    $('i-net').style.color = state.net >= 0 ? '#4ad991' : '#ff6b6b';
    $('i-sat').textContent = Math.round(state.satisfaction) + '%';
    $('b-sat').style.width = state.satisfaction + '%';
    $('b-sat').style.background = state.satisfaction > 60 ? '#4ad991' : (state.satisfaction > 35 ? '#ffb648' : '#ff6b6b');
    const pl = state.powerSup ? clamp(state.powerUse / state.powerSup * 100, 0, 100) : (state.powerUse > 0 ? 100 : 0);
    $('i-pow').textContent = Math.round(pl) + '%';
    $('b-pow').style.width = pl + '%';
    $('b-pow').style.background = pl > 95 ? '#ff6b6b' : '#ffb648';
  }

  const toastBox = $('toast');
  function toast(msg, type) {
    const d = document.createElement('div');
    d.className = 'tst' + (type ? ' ' + type : '');
    d.textContent = msg;
    toastBox.appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity .3s'; d.style.opacity = '0';
      setTimeout(function () { d.remove(); }, 320);
    }, 1900);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
  }

  function selectTool(t) {
    state.tool = t;
    const kids = $('toolbar').children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', kids[i].dataset.t === t);
    if (!t) ghost.visible = false;
    else if (hoverX >= 0) updateGhost(hoverX, hoverZ, canPlaceAt(hoverX, hoverZ));
  }

  (function buildToolbar() {
    const bar = $('toolbar');
    ORDER.forEach(function (t, i) {
      const d = DEF[t];
      const el = document.createElement('div');
      el.className = 'tool';
      el.dataset.t = t;
      el.innerHTML = '<div class="sw" style="background:' + d.color + '"></div>' +
        '<div class="n">' + d.name + '</div>' +
        '<div class="c">' + (t === 'bulldoze' ? '回收40%' : '¥' + d.cost) + '</div>' +
        '<div class="kbd">' + (t === 'bulldoze' ? 'X' : (i + 1)) + '</div>';
      el.addEventListener('click', function () { selectTool(state.tool === t ? null : t); });
      bar.appendChild(el);
    });
  })();

  function togglePause() {
    state.paused = !state.paused;
    $('btn-pause').textContent = state.paused ? '继续' : '暂停';
    $('btn-pause').classList.toggle('on', state.paused);
  }
  $('btn-pause').addEventListener('click', togglePause);
  Array.prototype.forEach.call(document.querySelectorAll('[data-sp]'), function (b) {
    b.addEventListener('click', function () {
      state.speed = parseFloat(b.dataset.sp);
      Array.prototype.forEach.call(document.querySelectorAll('[data-sp]'), function (o) { o.classList.remove('on'); });
      b.classList.add('on');
    });
  });
  $('tax').addEventListener('input', function (e) {
    state.tax = parseInt(e.target.value, 10) / 100;
    $('taxv').textContent = e.target.value + '%';
    simTick(true); refreshUI();
  });
  $('btn-save').addEventListener('click', function () {
    const data = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t) data.push([t.x, t.z, t.type, t.level]);
    }
    try {
      localStorage.setItem('mini-city-3d', JSON.stringify({
        t: data, m: state.money, p: state.pop, d: state.day, h: state.hour, x: state.tax
      }));
      toast('已保存到本机浏览器', 'ok');
    } catch (err) { toast('保存失败：浏览器不允许存储', 'err'); }
  });
  $('btn-load').addEventListener('click', function () {
    const raw = localStorage.getItem('mini-city-3d');
    if (!raw) { toast('没有找到存档', 'err'); return; }
    loadSave(JSON.parse(raw));
    toast('读档完成', 'ok');
  });
  $('btn-clear').addEventListener('click', function () {
    if (!confirm('确定清空整座城市？此操作不可撤销。')) return;
    clearAll();
    toast('城市已清空');
  });

  // 常驻玩法卡：右上"玩法"按钮展开，点标题折叠/展开
  (function bindGuide() {
    const g = $('guide');
    if (!g) return;
    const gh = g.querySelector('.gh');
    if (gh) gh.addEventListener('click', function () { g.classList.toggle('min'); });
    const bh = $('btn-help');
    if (bh) bh.addEventListener('click', function () { g.classList.remove('min'); });
  })();

  function clearAll() {
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t) { disposeGroup(t.group); tiles[i] = null; }
    }
    state.money = 26000; state.pop = 0; pop0 = 0; state.satisfaction = 62;
    state.day = 1; state.hour = 6; state.net = 0;
    simTick(true); refreshUI();
  }
  function loadSave(s) {
    clearAll();
    s.t.forEach(function (a) {
      const x = a[0], z = a[1];
      if (!inMap(x, z)) return;
      const t = { type: a[2], level: a[3], x: x, z: z, powered: false, road: false, group: null };
      t.group = (t.type === 'road') ? roadMesh(x, z) : buildMesh(t.type, t.level, x, z);
      scene.add(t.group);
      tiles[idx(x, z)] = t;
    });
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t && t.type === 'road') refreshRoadLook(t.x, t.z);
    }
    state.money = s.m; state.pop = s.p; pop0 = s.p; state.day = s.d || 1;
    state.hour = s.h || 6; state.tax = s.x || 0.09;
    $('tax').value = Math.round(state.tax * 100);
    $('taxv').textContent = Math.round(state.tax * 100) + '%';
    simTick(true); refreshUI();
  }

  /* ========================= 主循环 ========================= */
  const clock = new THREE.Clock();
  let acc = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.06, clock.getDelta());
    const scale = state.paused ? 0 : state.speed;

    // 键盘平移
    const k = 320 * dt;
    if (keys['w'] || keys['arrowup']) panScreen(0, k);
    if (keys['s'] || keys['arrowdown']) panScreen(0, -k);
    if (keys['a'] || keys['arrowleft']) panScreen(k, 0);
    if (keys['d'] || keys['arrowright']) panScreen(-k, 0);

    acc += dt * scale;
    while (acc >= 1) {
      acc -= 1;
      advanceTime();
      simTick(false);
      refreshUI();
    }

    const smooth = state.hour + acc;
    const night = updateSky(smooth);
    updateCars(dt * (state.paused ? 0 : Math.min(state.speed, 2)));

    const blink = Math.floor(clock.elapsedTime * 3) % 2 === 0;
    for (let i = 0; i < beacons.length; i++) beacons[i].visible = night > 0.4 ? blink : true;

    if (state.tool && hoverX >= 0) updateGhost(hoverX, hoverZ, canPlaceAt(hoverX, hoverZ));
    renderer.render(scene, camera);
  }

  // 开始按钮提前绑定：无论初始化是否成功，点击都有反应
  $('btn-start').addEventListener('click', function () {
    if ($('boot').dataset.fatal) return; // 已出错则保留错误提示
    $('boot').classList.add('hide');
    setTimeout(function () { $('boot').style.display = 'none'; }, 520);
  });

  try {
    simTick(true);
    refreshUI();
    updateSky(6);
    loop();
  } catch (err) {
    fatal(err && err.message ? err.message : String(err));
  }

  // 供调试
  window.__city = { state: state, tiles: tiles, place: place, simTick: simTick };
})();
