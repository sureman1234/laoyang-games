/* 超级玛丽 3 · 网页复刻 —— 引擎
   纯 Canvas 2D，无外部素材：所有画面由代码画，所有音效由 WebAudio 合成。 */
(() => {
'use strict';

const TW = 16, VW = 256, VH = 240, ROWS = 15;
const cv = document.getElementById('c');
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

/* ---------------- 画布自适应 ---------------- */
function fit() {
  const s = Math.max(1, Math.min(Math.floor((innerWidth - 24) / VW), Math.floor((innerHeight - 120) / VH)));
  cv.style.width = VW * s + 'px';
  cv.style.height = VH * s + 'px';
}
addEventListener('resize', fit); fit();
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.getElementById('touch').classList.remove('hide');

/* ---------------- 合成音效 ---------------- */
const Snd = {
  ac: null, on: true, musicOn: true, master: null, musTimer: 0, musStep: 0,
  init() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ac.destination);
    } catch (e) { this.on = false; }
  },
  tone(f, d, type = 'square', vol = 0.5, slide = 0) {
    if (!this.on || !this.ac) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), gn = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d = 0.12, vol = 0.4) {
    if (!this.on || !this.ac) return;
    const n = this.ac.sampleRate * d, buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(), gn = this.ac.createGain();
    s.buffer = buf; gn.gain.value = vol; s.connect(gn); gn.connect(this.master); s.start();
  },
  sfx(k) {
    switch (k) {
      case 'jump': this.tone(420, 0.14, 'square', 0.35, 260); break;
      case 'bigjump': this.tone(520, 0.18, 'square', 0.35, 320); break;
      case 'coin': this.tone(988, 0.07, 'square', 0.3); setTimeout(() => this.tone(1319, 0.12, 'square', 0.3), 70); break;
      case 'stomp': this.tone(300, 0.08, 'square', 0.3, -180); this.noise(0.08, 0.25); break;
      case 'bump': this.tone(160, 0.07, 'square', 0.3, -60); break;
      case 'brick': this.noise(0.16, 0.45); this.tone(220, 0.1, 'square', 0.2, -120); break;
      case 'power': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.11, 'square', 0.3), i * 70)); break;
      case 'tail': this.tone(700, 0.1, 'sawtooth', 0.25, -400); break;
      case 'fire': this.tone(880, 0.08, 'sawtooth', 0.22, -500); break;
      case 'shrink': [784, 659, 523, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.1, 'square', 0.25), i * 60)); break;
      case 'die': [523, 494, 440, 392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.32), i * 110)); break;
      case 'clear': [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.3), i * 120)); break;
      case '1up': [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.13, 'square', 0.3), i * 90)); break;
      case 'pause': this.tone(660, 0.08, 'triangle', 0.3); break;
      case 'boss': this.tone(90, 0.3, 'sawtooth', 0.4, -40); this.noise(0.3, 0.3); break;
      case 'axe': this.noise(0.25, 0.5); this.tone(140, 0.3, 'square', 0.35, 300); break;
    }
  },
  /* 原创循环旋律（非任天堂曲） */
  MEL: [
    [523, 2], [659, 2], [784, 2], [659, 2], [523, 2], [587, 2], [659, 4],
    [440, 2], [523, 2], [659, 2], [523, 2], [440, 2], [494, 2], [523, 4],
    [523, 2], [659, 2], [784, 2], [880, 2], [784, 2], [659, 2], [587, 4],
    [494, 2], [587, 2], [698, 2], [587, 2], [494, 2], [440, 2], [392, 4]
  ],
  BASS: [131, 0, 196, 0, 131, 0, 196, 0, 110, 0, 165, 0, 110, 0, 165, 0,
         131, 0, 196, 0, 131, 0, 196, 0, 98, 0, 147, 0, 98, 0, 147, 0],
  tickMusic() {
    if (!this.musicOn || !this.on || !this.ac) return;
    if (this.musTimer > 0) { this.musTimer--; return; }
    const mi = this.musStep % this.MEL.length;
    const [f, len] = this.MEL[mi];
    this.tone(f, 0.1 * len, 'square', 0.11);
    const bi = this.musStep % this.BASS.length;
    if (this.BASS[bi]) this.tone(this.BASS[bi], 0.16, 'triangle', 0.16);
    this.musStep++;
    this.musTimer = len * 6 - 1;
  }
};

/* ---------------- 输入 ---------------- */
const K = { left: 0, right: 0, up: 0, down: 0, jump: 0, run: 0, start: 0, pause: 0 };
const KP = {}; // 上一帧
const MAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
  KeyX: 'run', KeyJ: 'run', ShiftLeft: 'run', ShiftRight: 'run',
  Enter: 'start', KeyP: 'pause', Escape: 'pause'
};
addEventListener('keydown', e => {
  const k = MAP[e.code]; if (!k) return;
  if (!KP[k]) { /* 边沿在 update 里比对 */ }
  K[k] = 1; e.preventDefault(); Snd.init();
  if (e.code === 'KeyR' && Game.mode === 'play') Game.restartLevel();
  if (e.code === 'KeyM') { Snd.musicOn = !Snd.musicOn; }
}, { passive: false });
addEventListener('keyup', e => { const k = MAP[e.code]; if (k) { K[k] = 0; e.preventDefault(); } }, { passive: false });
addEventListener('blur', () => { for (const k in K) K[k] = 0; });

// 触屏
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); K[k] = 1; Snd.init(); if (k === 'jump' && Game.mode !== 'play') K.start = 1; };
  const off = e => { e.preventDefault(); K[k] = 0; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});
cv.addEventListener('pointerdown', () => { Snd.init(); if (Game.mode !== 'play') K.start = 1; });

const pressed = k => K[k] && !KP[k];

/* ---------------- 常量 ---------------- */
const SOLID = new Set(['#', 'B', '?', 'M', 'L', 'F', 'u', 'P', 'Q', 'p', 'q', '=']);
const BUMPABLE = new Set(['B', '?', 'M', 'L', 'F']);
const HAZARD = new Set(['l', 'i']);
const SKY = { grass: '#5c94fc', cave: '#0b0b16', sky: '#88b8ff', castle: '#1a1620' };

/* ---------------- 关卡构建 ---------------- */
function buildLevel(def) {
  const w = def.w;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(w).fill(' '));
  const put = (x, r, c) => { if (x >= 0 && x < w && r >= 0 && r < ROWS) grid[r][x] = c; };

  (def.ground || []).forEach(([x0, x1, top]) => {
    const t = top === undefined ? 13 : top;
    for (let x = x0; x < x1; x++) for (let r = t; r < ROWS; r++) put(x, r, '#');
  });
  (def.ceilings || []).forEach(([x0, x1, r]) => { for (let x = x0; x < x1; x++) put(x, r, '#'); });
  (def.bricks || []).forEach(([x, r]) => put(x, r, 'B'));
  (def.q || []).forEach(([x, r, type]) => {
    put(x, r, type === 'coin' ? '?' : type === 'mush' ? 'M' : type === 'leaf' ? 'L' : type === 'fire' ? 'F' : '?');
  });
  (def.plats || []).forEach(([x, r, len]) => { for (let i = 0; i < len; i++) put(x + i, r, '='); });
  (def.spikes || []).forEach(([x, r]) => put(x, r, 'i'));
  (def.lava || []).forEach(([x0, x1]) => { for (let x = x0; x < x1; x++) { put(x, 13, 'l'); put(x, 14, 'l'); } });
  (def.pipes || []).forEach(([x, h]) => {
    const top = 13 - h;
    put(x, top, 'P'); put(x + 1, top, 'Q');
    for (let r = top + 1; r < 13; r++) { put(x, r, 'p'); put(x + 1, r, 'q'); }
  });
  (def.stairs || []).forEach(([x, dir, h]) => {
    for (let i = 0; i < h; i++) {
      const col = dir === 'right' ? x + i : x + (h - 1 - i);
      for (let r = 13 - 1 - i; r < 13; r++) put(col, r, '#');
    }
  });

  const coins = [], enemies = [], items = [];
  (def.coins || []).forEach(([x, r, n]) => { for (let i = 0; i < n; i++) coins.push({ x: (x + i) * TW + 4, y: r * TW + 2, t: i * 0.2, got: false }); });
  (def.enemies || []).forEach(([t, x, r]) => {
    if (t === 'goomba') enemies.push(mkGoomba(x * TW + 1, r * TW - 14));
    else if (t === 'koopa') enemies.push(mkKoopa(x * TW + 1, r * TW - 18));
    else if (t === 'piranha') enemies.push(mkPiranha(x * TW + 1, r * TW));
  });
  if (def.boss) enemies.push(mkBoss(def.boss[0] * TW, def.boss[1] * TW - 44));

  return { def, w, grid, coins, enemies, items, fx: [], bumps: [], t: 0 };
}

const solidAt = (lv, tx, ty) => {
  if (ty < 0) return false;
  if (ty >= ROWS) return false;
  if (tx < 0 || tx >= lv.w) return true; // 边界当墙
  return SOLID.has(lv.grid[ty][tx]);
};
const tileAt = (lv, tx, ty) => (ty < 0 || ty >= ROWS || tx < 0 || tx >= lv.w) ? ' ' : lv.grid[ty][tx];

/* ---------------- 实体 ---------------- */
function mkGoomba(x, y) { return { t: 'goomba', x, y, w: 14, h: 14, vx: -0.55, vy: 0, dead: 0, squash: 0, onGround: 0 }; }
function mkKoopa(x, y) { return { t: 'koopa', x, y, w: 14, h: 18, vx: -0.5, vy: 0, state: 'walk', squash: 0, dead: 0, onGround: 0, timer: 0 }; }
function mkPiranha(x, y) {
  // y 是管口行的像素顶；躲进管里时 y 在管口下方，出来时上移 26
  return { t: 'piranha', x: x + 2, y: y + 8, homeY: y + 8, outY: y - 18, w: 12, h: 24, out: 0, phase: Math.random() * 6.28, dead: 0 };
}
function mkBoss(x, y) {
  return { t: 'boss', x, y, w: 34, h: 44, vx: 0, vy: 0, hp: 5, dead: 0, cd: 90, onGround: 0, hurtT: 0 };
}

/* ---------------- 玩家 ---------------- */
function mkPlayer(form) {
  const h = form > 0 ? 26 : 14;
  return {
    x: 40, y: 0, w: 12, h, vx: 0, vy: 0, form, onGround: 0, facing: 1,
    anim: 0, jumpT: 0, coyote: 0, buffer: 0, invuln: 0, dead: 0, deadT: 0,
    spinning: 0, fireCd: 0, runT: 0, skid: 0
  };
}

/* ---------------- 主状态 ---------------- */
const Game = {
  mode: 'title',
  score: 0, coins: 0, lives: 3, node: 0, cleared: {},
  best: 0,
  lv: null, p: null, cam: 0, timeLeft: 0, timeSub: 0,
  clearT: 0, cardIdx: 0, cardSpin: 0, cardResult: 0, cardStopped: 0,
  deadT: 0, transT: 0, started: false,

  load() {
    try {
      const s = JSON.parse(localStorage.getItem('smb3_v1') || '{}');
      this.cleared = s.cleared || {}; this.best = s.best || 0; this.node = s.node || 0;
    } catch (e) { }
  },
  save() {
    try { localStorage.setItem('smb3_v1', JSON.stringify({ cleared: this.cleared, best: Math.max(this.best, this.score), node: this.node })); } catch (e) { }
  },

  startLevel(id, keepForm) {
    const def = LEVELS[id];
    this.lv = buildLevel(def);
    const form = keepForm ? (this.p ? this.p.form : 0) : 0;
    const p = mkPlayer(form);
    p.x = def.start[0] * TW;
    p.y = def.start[1] * TW - p.h;
    this.p = p;
    this.cam = 0;
    this.timeLeft = def.time * 24;
    this.mode = 'play';
    this.clearT = 0;
    this.cardStopped = 0; this.cardResult = 0;
    if (Snd.ac && Snd.ac.state === 'suspended') Snd.ac.resume();
  },
  restartLevel() { if (this.lv) this.startLevel(this.lv.def.id, true); }
};

/* ---------------- 碰撞 ---------------- */
function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const solidForX = (lv, tx, ty) => { const c = tileAt(lv, tx, ty); return c !== '=' && SOLID.has(c) ; };
const solidForDown = (lv, tx, ty) => SOLID.has(tileAt(lv, tx, ty));
const solidForUp = (lv, tx, ty) => { const c = tileAt(lv, tx, ty); return c !== '=' && SOLID.has(c); };

function moveEntity(e, lv, dx, dy) {
  // X
  e.x += dx;
  let x0 = Math.floor(e.x / TW), x1 = Math.floor((e.x + e.w - 1) / TW);
  let y0 = Math.floor(e.y / TW), y1 = Math.floor((e.y + e.h - 1) / TW);
  if (dx !== 0) {
    for (let ty = y0; ty <= y1; ty++) {
      const tx = dx > 0 ? x1 : x0;
      if (solidForX(lv, tx, ty)) {
        if (dx > 0) e.x = tx * TW - e.w - 0.01; else e.x = (tx + 1) * TW + 0.01;
        e.hitWall = dx > 0 ? 1 : -1;
        break;
      }
    }
  }
  // Y
  e.y += dy;
  x0 = Math.floor(e.x / TW); x1 = Math.floor((e.x + e.w - 1) / TW);
  y0 = Math.floor(e.y / TW); y1 = Math.floor((e.y + e.h - 1) / TW);
  e.onGround = 0;
  if (dy !== 0) {
    for (let tx = x0; tx <= x1; tx++) {
      const ty = dy > 0 ? y1 : y0;
      const hit = dy > 0 ? solidForDown(lv, tx, ty) : solidForUp(lv, tx, ty);
      if (hit) {
        if (dy > 0) { e.y = ty * TW - e.h - 0.01; e.onGround = 1; e.vy = 0; }
        else { e.y = (ty + 1) * TW + 0.01; e.headHit = { tx, ty }; e.vy = 0; }
        break;
      }
    }
  }
}

/* 顶砖块 */
function bumpBlock(lv, tx, ty, p) {
  const t = tileAt(lv, tx, ty);
  if (!BUMPABLE.has(t)) { if (t !== ' ') Snd.sfx('bump'); return; }
  lv.bumps.push({ tx, ty, t: 0 });
  if (t === 'B') {
    if (p.form > 0) {
      lv.grid[ty][tx] = ' ';
      Snd.sfx('brick');
      for (let i = 0; i < 6; i++) lv.fx.push({ x: tx * TW + 8, y: ty * TW + 8, vx: (Math.random() - .5) * 3, vy: -Math.random() * 3, life: 40, c: '#c8641e' });
      Game.score += 50;
    } else Snd.sfx('bump');
    return;
  }
  // 问号类
  lv.grid[ty][tx] = 'u';
  Snd.sfx('coin');
  if (t === '?') {
    Game.coins++; Game.score += 200;
    lv.fx.push({ x: tx * TW + 4, y: ty * TW - 8, vy: -3.4, t: 'coin', life: 34 });
  } else if (t === 'M') {
    lv.items.push({ t: 'mush', x: tx * TW + 2, y: ty * TW, w: 14, h: 14, vx: 0.9, vy: -1.2, rise: 16, onGround: 0 });
  } else if (t === 'L') {
    lv.items.push({ t: 'leaf', x: tx * TW + 2, y: ty * TW, w: 14, h: 14, vx: 0.8, vy: 0, rise: 16, onGround: 0 });
  } else if (t === 'F') {
    lv.items.push({ t: 'fire', x: tx * TW + 2, y: ty * TW, w: 14, h: 14, vx: 0, vy: 0, rise: 16, onGround: 0 });
  }
}

/* ---------------- 玩家更新 ---------------- */
function updatePlayer(p, lv, dt) {
  const runK = K.run;
  const acc = runK ? 0.24 : 0.16;
  const maxSpd = runK ? 3.05 : 1.75;

  if (!p.dead) {
    if (K.left && !K.right) { p.vx -= acc; p.facing = -1; }
    else if (K.right && !K.left) { p.vx += acc; p.facing = 1; }
    else {
      const f = p.onGround ? 0.14 : 0.04;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - f); else p.vx = Math.min(0, p.vx + f);
    }
    p.vx = Math.max(-maxSpd, Math.min(maxSpd, p.vx));
    p.skid = (p.onGround && ((p.vx > 0.6 && K.left) || (p.vx < -0.6 && K.right))) ? 1 : 0;

    // 跳
    if (pressed('jump')) p.buffer = 8;
    if (p.buffer > 0) p.buffer--;
    if (p.onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -(6.4 + Math.min(2.2, Math.abs(p.vx) * 0.5));
      p.onGround = 0; p.coyote = 0; p.buffer = 0; p.jumpT = 12;
      Snd.sfx(Math.abs(p.vx) > 2 ? 'bigjump' : 'jump');
    }
    if (!K.jump) p.jumpT = 0;

    // 重力
    let grav = 0.36;
    if (p.jumpT > 0 && p.vy < 0) { grav = 0.19; p.jumpT--; }
    if (p.form === 2 && !p.onGround && K.jump && p.vy > 0) grav = 0.10; // 甩尾缓降
    p.vy = Math.min(7.4, p.vy + grav);

    // 甩尾
    if (p.spinning > 0) p.spinning--;
    if (pressed('run') && p.form === 2 && p.onGround === 0) {
      p.spinning = 18; Snd.sfx('tail');
    }
    // 火球
    if (p.fireCd > 0) p.fireCd--;
    if (pressed('run') && p.form === 3 && p.fireCd === 0 && lv.items.filter(i => i.t === 'ball').length < 2) {
      p.fireCd = 20;
      lv.items.push({ t: 'ball', x: p.x + (p.facing > 0 ? p.w : -8), y: p.y + 8, w: 8, h: 8, vx: p.facing * 4.2, vy: -1, life: 220 });
      Snd.sfx('fire');
    }

    p.headHit = null;
    moveEntity(p, lv, p.vx, p.vy);
    if (p.headHit) { bumpBlock(lv, p.headHit.tx, p.headHit.ty, p); p.vy = 0.6; }
    if (p.onGround) p.runT = 0; else p.runT++;

    p.anim += Math.abs(p.vx) * 0.16;

    // 掉出画面
    if (p.y > VH + 40) killPlayer(p);
  } else {
    p.deadT++;
    if (p.deadT > 30) { p.vy = Math.min(8, p.vy + 0.35); p.y += p.vy; }
  }

  // 金币
  lv.coins.forEach(c => {
    if (c.got) return;
    if (rectHit(p, { x: c.x, y: c.y, w: 10, h: 12 })) {
      c.got = true; Game.coins++; Game.score += 200; Snd.sfx('coin');
      lv.fx.push({ x: c.x, y: c.y, vy: -2, t: 'coin', life: 26 });
    }
  });

  // 道具
  lv.items.forEach(it => {
    if (it.dead || it.t === 'ball') return;
    if (rectHit(p, it)) {
      it.dead = true;
      applyPower(p, it.t);
    }
  });

  // 岩浆 / 尖刺
  const cx = Math.floor((p.x + p.w / 2) / TW), cy = Math.floor((p.y + p.h / 2) / TW);
  if (HAZARD.has(tileAt(lv, cx, cy)) || HAZARD.has(tileAt(lv, cx, Math.floor((p.y + p.h - 2) / TW)))) {
    if (p.form === 0) killPlayer(p); else hurtPlayer(p);
  }
}

function applyPower(p, type) {
  if (type === 'mush') {
    if (p.form === 0) { p.form = 1; p.h = 26; p.y -= 12; Snd.sfx('power'); }
    else { Game.score += 1000; Snd.sfx('power'); }
  } else if (type === 'fire') { p.form = 3; if (p.h === 14) { p.h = 26; p.y -= 12; } Snd.sfx('power'); }
  else if (type === 'leaf') { p.form = 2; if (p.h === 14) { p.h = 26; p.y -= 12; } Snd.sfx('power'); }
  else if (type === 'star') { p.invuln = 480; Snd.sfx('1up'); }
  else if (type === '1up') { Game.lives++; Snd.sfx('1up'); }
}

function hurtPlayer(p) {
  if (p.invuln > 0 || p.dead) return;
  if (p.form > 0) {
    p.form = 0; p.h = 14; p.y += 12; p.invuln = 100; Snd.sfx('shrink');
  } else killPlayer(p);
}

function killPlayer(p) {
  if (p.dead) return;
  p.dead = 1; p.vy = -6.4; p.deadT = 0; p.vx = 0;
  Game.mode = 'dead'; Game.deadT = 0;
  Snd.sfx('die');
}

/* ---------------- 敌人 ---------------- */
function updateEnemy(e, lv, p) {
  if (e.dead) { e.dead++; return; }
  if (e.squash > 0) { e.squash--; if (e.squash === 0) e.dead = 1; return; }

  if (e.t === 'goomba') {
    e.vy = Math.min(7, e.vy + 0.34);
    e.hitWall = 0;
    moveEntity(e, lv, e.vx, e.vy);
    if (e.hitWall) e.vx = -e.vx;
  } else if (e.t === 'koopa') {
    if (e.state === 'walk') {
      e.vy = Math.min(7, e.vy + 0.34);
      e.hitWall = 0; e.vx = e.vx > 0 ? 0.5 : -0.5;
      moveEntity(e, lv, e.vx, e.vy);
      if (e.hitWall) e.vx = -e.vx;
    } else if (e.state === 'shell') {
      e.vy = Math.min(7, e.vy + 0.34);
      e.vx = 0; e.hitWall = 0;
      moveEntity(e, lv, 0, e.vy);
    } else if (e.state === 'slide') {
      e.vy = Math.min(7, e.vy + 0.3);
      e.hitWall = 0;
      moveEntity(e, lv, e.vx, e.vy);
      if (e.hitWall) { e.vx = -e.vx; Snd.sfx('bump'); }
      // 撞死其他敌人
      lv.enemies.forEach(o => {
        if (o !== e && !o.dead && o.squash === 0 && rectHit(e, o)) {
          o.dead = 1; Game.score += 200;
          lv.fx.push({ x: o.x, y: o.y, vy: -2, t: 'text', txt: '200', life: 40 });
          Snd.sfx('stomp');
        }
      });
    }
  } else if (e.t === 'piranha') {
    e.phase += 0.02;
    const near = Math.abs(p.x - e.x) < 36 && p.y > e.homeY - 40;
    const wantOut = Math.sin(e.phase) > 0.15 && !near;
    e.y += (wantOut ? -0.6 : 0.6);
    e.y = Math.max(e.outY, Math.min(e.homeY, e.y));
    e.out = e.y < e.homeY - 4;
  } else if (e.t === 'boss') {
    e.hurtT = Math.max(0, e.hurtT - 1);
    e.vy = Math.min(7, e.vy + 0.36);
    // 缓慢逼近
    const dir = p.x < e.x ? -1 : 1;
    e.vx = e.onGround ? dir * 0.55 : e.vx;
    e.hitWall = 0;
    moveEntity(e, lv, e.vx, e.vy);
    if (e.onGround && (e.hitWall || Math.random() < 0.01)) e.vy = -5.4;
    // 喷火
    e.cd--;
    if (e.cd <= 0) {
      e.cd = 150;
      lv.items.push({ t: 'bfire', x: e.x + 4, y: e.y + 18, w: 10, h: 10, vx: dir * 2.4, vy: -0.6, life: 300 });
      Snd.sfx('boss');
    }
  }

  // 与玩家
  if (!p.dead && rectHit(e, p)) {
    if (e.t === 'piranha') { hurtPlayer(p); }
    else if (e.t === 'goomba' || e.t === 'koopa') {
      const stomp = p.vy > 0.6 && (p.y + p.h) - e.y < 14;
      if (stomp) {
        p.vy = -5.4; p.jumpT = 0;
        if (e.t === 'goomba') { e.squash = 18; Game.score += 100; Snd.sfx('stomp'); }
        else {
          if (e.state === 'walk') { e.state = 'shell'; e.h = 12; e.y += 6; e.vx = 0; Game.score += 100; Snd.sfx('stomp'); }
          else if (e.state === 'slide') { e.state = 'shell'; e.vx = 0; Snd.sfx('stomp'); }
          else { // 踢
            e.state = 'slide'; e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 3.4 : -3.4;
            Snd.sfx('stomp'); Game.score += 100;
          }
        }
      } else if (e.t === 'koopa' && e.state === 'shell') {
        e.state = 'slide'; e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 3.4 : -3.4; Snd.sfx('stomp');
      } else hurtPlayer(p);
    } else if (e.t === 'boss') {
      if (p.spinning > 0 && e.hurtT === 0) { e.hurtT = 40; e.hp--; Snd.sfx('bump'); p.vx = -p.facing * 2; if (e.hp <= 0) { e.dead = 1; Game.score += 2000; } }
      else hurtPlayer(p);
    }
  }
}

/* ---------------- 道具更新 ---------------- */
function updateItem(it, lv, p) {
  if (it.dead) return;
  if (it.t === 'mush' || it.t === 'leaf') {
    if (it.rise > 0) { it.rise -= 0.7; it.y -= 0.7; return; }
    if (it.t === 'mush') {
      it.vy = Math.min(6, it.vy + 0.32); it.hitWall = 0;
      moveEntity(it, lv, it.vx, it.vy);
      if (it.hitWall) it.vx = -it.vx;
    } else {
      it.vy = Math.min(1.5, it.vy + 0.06);
      it.hitWall = 0;
      moveEntity(it, lv, it.vx, it.vy);
      if (it.hitWall) it.vx = -it.vx;
      it.vx = it.vx + Math.sin((Game.lv.t + it.x) * 0.05) * 0.06;
    }
    if (it.y > VH + 30) it.dead = 1;
  } else if (it.t === 'fire') {
    if (it.rise > 0) { it.rise -= 0.9; it.y -= 0.9; }
  } else if (it.t === 'ball') {
    it.vy = Math.min(6, it.vy + 0.4);
    it.hitWall = 0;
    const oy = it.vy;
    moveEntity(it, lv, it.vx, it.vy);
    if (it.onGround) it.vy = -3.3;
    if (it.hitWall) it.dead = 1;
    it.life--;
    if (it.life <= 0) it.dead = 1;
    lv.enemies.forEach(e => {
      if (!e.dead && e.squash === 0 && e.t !== 'piranha' && rectHit(it, e)) {
        it.dead = 1;
        if (e.t === 'boss') { if (e.hurtT === 0) { e.hp--; e.hurtT = 30; } } else { e.dead = 1; Game.score += 200; Snd.sfx('stomp'); }
      }
    });
  } else if (it.t === 'bfire') {
    it.vy = Math.min(5, it.vy + 0.14);
    it.life--;
    it.x += it.vx; it.y += it.vy;
    if (it.life <= 0) it.dead = 1;
    if (rectHit(it, p) && !p.dead) { it.dead = 1; hurtPlayer(p); }
  }
}

/* ---------------- 绘制：背景 ---------------- */
function drawBg(theme, cam) {
  if (theme === 'grass') {
    const grad = g.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#5c94fc'); grad.addColorStop(1, '#9fd0ff');
    g.fillStyle = grad; g.fillRect(0, 0, VW, VH);
    // 云
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 97 - cam * 0.25) % (VW + 120) + VW + 120) % (VW + 120) - 60;
      drawCloud(bx, 26 + (i % 3) * 26, 1 + (i % 2) * 0.4);
    }
    // 远山
    g.fillStyle = '#3aa657';
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 110 - cam * 0.45) % (VW + 160) + VW + 160) % (VW + 160) - 80;
      g.beginPath(); g.moveTo(bx, 208); g.quadraticCurveTo(bx + 40, 150, bx + 80, 208); g.fill();
    }
    g.fillStyle = '#2f8a48';
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 76 - cam * 0.6) % (VW + 120) + VW + 120) % (VW + 120) - 50;
      g.beginPath(); g.arc(bx, 214, 18, Math.PI, 0); g.fill();
    }
  } else if (theme === 'cave') {
    g.fillStyle = '#06060e'; g.fillRect(0, 0, VW, VH);
    // 暗纹
    g.fillStyle = 'rgba(40,60,140,.16)';
    for (let i = 0; i < 12; i++) {
      const bx = ((i * 52 - cam * 0.3) % (VW + 100) + VW + 100) % (VW + 100) - 50;
      g.fillRect(bx, 0, 10, VH);
    }
    // 洞顶渗下来的光
    const gr = g.createLinearGradient(0, 0, 0, 90);
    gr.addColorStop(0, 'rgba(90,120,220,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, VW, 90);
  } else if (theme === 'sky') {
    const grad = g.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#79b6ff'); grad.addColorStop(1, '#d3ecff');
    g.fillStyle = grad; g.fillRect(0, 0, VW, VH);
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 4; i++) {
      const bx = ((i * 130 - cam * 0.12) % (VW + 200) + VW + 200) % (VW + 200) - 100;
      drawCloud(bx, 40 + (i * 53) % 100, 1.5);
    }
  } else {
    const grad = g.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#141018'); grad.addColorStop(.7, '#241a20'); grad.addColorStop(1, '#3b1c14');
    g.fillStyle = grad; g.fillRect(0, 0, VW, VH);
    g.fillStyle = 'rgba(255,120,40,.10)';
    for (let i = 0; i < 7; i++) g.fillRect(0, 150 + i * 14, VW, 2);
  }
}
function txt(str, x, y, size, color, align) {
  g.font = 'bold ' + size + 'px monospace';
  g.textAlign = align || 'left'; g.textBaseline = 'top';
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillText(str, x + 1, y + 1);
  g.fillStyle = color; g.fillText(str, x, y);
  g.textAlign = 'left';
}
function drawCloud(x, y, s) {
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.beginPath();
  g.arc(x, y, 8 * s, 0, 7); g.arc(x + 10 * s, y - 5 * s, 10 * s, 0, 7);
  g.arc(x + 22 * s, y, 8 * s, 0, 7); g.fill();
  g.fillRect(x - 6 * s, y, 30 * s, 7 * s);
}

/* ---------------- 绘制：砖块与地面 ---------------- */
function drawTile(ch, sx, sy, theme, t, lv, tx, ty) {
  switch (ch) {
    case '#': {
      if (theme === 'grass') {
        g.fillStyle = '#c46a1f'; g.fillRect(sx, sy, TW, TW);
        g.fillStyle = '#e08a35'; g.fillRect(sx, sy, TW, 3);
        g.fillStyle = '#4cc94c'; g.fillRect(sx, sy, TW, 4);
        g.fillStyle = '#2f9c38'; g.fillRect(sx, sy + 4, TW, 2);
        g.fillStyle = 'rgba(0,0,0,.16)';
        g.fillRect(sx, sy + 10, TW, 1); g.fillRect(sx + 7, sy + 4, 1, 6); g.fillRect(sx + 12, sy + 11, 1, 5);
      } else if (theme === 'cave') {
        g.fillStyle = '#2a3a8a'; g.fillRect(sx, sy, TW, TW);
        g.fillStyle = '#3d54b8'; g.fillRect(sx + 1, sy + 1, TW - 2, 6);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(sx, sy + 8, TW, 1); g.fillRect(sx + 8, sy, 1, 8);
      } else if (theme === 'sky') {
        g.fillStyle = '#ffffff'; g.fillRect(sx, sy, TW, TW);
        g.fillStyle = '#9dc0ee'; g.fillRect(sx, sy + TW - 4, TW, 4);
        g.fillStyle = '#c9daf5'; g.fillRect(sx, sy + 10, TW, 2);
        g.fillStyle = '#7aa6dd'; g.fillRect(sx, sy + TW - 1, TW, 1);
      } else {
        g.fillStyle = '#4a4356'; g.fillRect(sx, sy, TW, TW);
        g.fillStyle = '#5d5570'; g.fillRect(sx + 1, sy + 1, TW - 2, 4);
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(sx, sy + 10, TW, 1);
      }
      break;
    }
    case 'B': {
      g.fillStyle = '#b3541a'; g.fillRect(sx, sy, TW, TW);
      g.fillStyle = '#d9762c';
      for (let r = 0; r < 4; r++) {
        const off = (r % 2) * 4;
        for (let c = 0; c < 3; c++) g.fillRect(sx + 1 + off + c * 6, sy + 1 + r * 4, 5, 3);
      }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(sx, sy + TW - 1, TW, 1);
      break;
    }
    case '?': case 'M': case 'L': case 'F': {
      const pulse = Math.sin(t * 0.12 + tx) * 0.5 + 0.5;
      g.fillStyle = `rgb(${226 + pulse * 20},${160 + pulse * 40},${30})`;
      g.fillRect(sx, sy, TW, TW);
      g.fillStyle = '#7a4a00'; g.fillRect(sx, sy, TW, 1); g.fillRect(sx, sy + TW - 1, TW, 1);
      g.fillRect(sx, sy, 1, TW); g.fillRect(sx + TW - 1, sy, 1, TW);
      g.fillStyle = '#fff6c8';
      for (const [dx, dy] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.fillRect(sx + dx, sy + dy, 1, 1);
      // 手画胖问号
      g.fillStyle = '#6b3d00';
      g.fillRect(sx + 6, sy + 3, 5, 2);
      g.fillRect(sx + 10, sy + 5, 2, 2);
      g.fillRect(sx + 8, sy + 7, 3, 2);
      g.fillRect(sx + 7, sy + 9, 2, 2);
      g.fillRect(sx + 7, sy + 12, 2, 2);
      g.fillStyle = '#fff2b8';
      g.fillRect(sx + 6, sy + 2, 4, 1);
      break;
    }
    case 'u': {
      g.fillStyle = '#8a5a2a'; g.fillRect(sx, sy, TW, TW);
      g.fillStyle = '#6d4520'; g.fillRect(sx + 1, sy + 1, TW - 2, TW - 2);
      break;
    }
    case '=': {
      if (theme === 'sky') {
        g.fillStyle = '#eef5ff'; g.fillRect(sx, sy, TW, 11);
        g.fillStyle = '#ffffff'; g.fillRect(sx, sy, TW, 3);
        g.fillStyle = '#a9c8ec'; g.fillRect(sx, sy + 8, TW, 3);
        g.fillStyle = '#7aa6dd'; g.fillRect(sx, sy + 10, TW, 1);
      } else if (theme === 'castle') {
        g.fillStyle = '#6b6070'; g.fillRect(sx, sy, TW, 8);
        g.fillStyle = '#4a4152'; g.fillRect(sx, sy + 6, TW, 2);
      } else {
        g.fillStyle = '#d08a2c'; g.fillRect(sx, sy, TW, 8);
        g.fillStyle = '#8a4a10'; g.fillRect(sx, sy + 6, TW, 2);
      }
      break;
    }
    case 'P': case 'Q': case 'p': case 'q': {
      const isTop = ch === 'P' || ch === 'Q';
      const isLeft = ch === 'P' || ch === 'p';
      const x0 = sx, w = TW;
      g.fillStyle = '#1f9c3a'; g.fillRect(x0, sy, w, TW);
      g.fillStyle = '#45d45f'; g.fillRect(x0 + (isLeft ? 2 : 0), sy, 4, TW);
      g.fillStyle = '#0f6b23'; g.fillRect(x0 + (isLeft ? 0 : TW - 3), sy, 3, TW);
      if (isTop) {
        g.fillStyle = '#1f9c3a'; g.fillRect(x0 - (isLeft ? 2 : 0), sy, w + 2, 6);
        g.fillStyle = '#45d45f'; g.fillRect(x0 - (isLeft ? 2 : 0), sy, w + 2, 2);
        g.fillStyle = '#0b4d18'; g.fillRect(x0 - (isLeft ? 2 : 0), sy + 5, w + 2, 1);
      }
      break;
    }
    case 'l': {
      const wob = Math.sin(t * 0.08 + tx) * 2;
      g.fillStyle = '#ff5a1e'; g.fillRect(sx, sy, TW, TW);
      g.fillStyle = '#ffb020'; g.fillRect(sx, sy + 2 + wob, TW, 4);
      g.fillStyle = '#ffe27a'; g.fillRect(sx, sy + 3 + wob, TW, 1);
      break;
    }
    case 'i': {
      g.fillStyle = '#b8c0d0';
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(sx + i * 8, sy + TW);
        g.lineTo(sx + i * 8 + 4, sy + 2);
        g.lineTo(sx + i * 8 + 8, sy + TW);
        g.fill();
      }
      g.fillStyle = '#79839a'; g.fillRect(sx, sy + TW - 2, TW, 2);
      break;
    }
    default: break;
  }
}

/* ---------------- 绘制：角色 ---------------- */
const PAL = {
  cap: '#e8392b', skin: '#f8c99e', dark: '#2a1710', blue: '#2b53c8',
  shoe: '#6f3413', white: '#f7f7ff', leaf: '#a9682c', leafD: '#7c491b', gold: '#f2c53d'
};

function drawMario(px, py, form, facing, anim, spinning) {
  const big = form > 0;
  const shirt = form === 3 ? '#e8392b' : (form === 2 ? PAL.leaf : PAL.cap);
  const overall = form === 3 ? PAL.white : (form === 2 ? PAL.leafD : PAL.blue);
  const H = big ? 26 : 14;
  const step = Math.floor(anim) % 4;

  g.save();
  g.translate(Math.round(px + 6), Math.round(py + H));
  if (facing < 0) g.scale(-1, 1);
  g.translate(-6, -H);

  if (big) {
    // 头
    g.fillStyle = PAL.skin; g.fillRect(2, 2, 8, 7);
    g.fillStyle = PAL.cap; g.fillRect(1, 0, 10, 4); g.fillRect(0, 4, 3, 1);
    g.fillStyle = PAL.dark; g.fillRect(8, 4, 1, 2); g.fillRect(4, 7, 5, 1);
    // 身体
    g.fillStyle = shirt; g.fillRect(2, 9, 8, 8);
    g.fillStyle = overall; g.fillRect(3, 13, 6, 9); g.fillRect(2, 16, 8, 3);
    g.fillStyle = PAL.gold; g.fillRect(4, 16, 1, 1); g.fillRect(7, 16, 1, 1);
    // 腿
    g.fillStyle = PAL.shoe;
    if (step === 0) { g.fillRect(1, 22, 4, 4); g.fillRect(7, 22, 4, 4); }
    else if (step === 1) { g.fillRect(0, 22, 5, 4); g.fillRect(6, 21, 5, 5); }
    else if (step === 2) { g.fillRect(2, 21, 4, 5); g.fillRect(8, 22, 4, 4); }
    else { g.fillRect(1, 21, 5, 5); g.fillRect(7, 22, 4, 4); }
    // 叶子装：耳朵 + 尾巴
    if (form === 2) {
      g.fillStyle = PAL.leaf;
      g.fillRect(2, -2, 2, 3); g.fillRect(8, -2, 2, 3);
      g.fillRect(-4, 14 + (spinning ? Math.sin(performance.now() / 40) * 3 : 0), 6, 4);
      g.fillStyle = PAL.leafD; g.fillRect(-5, 15, 2, 2);
    }
  } else {
    g.fillStyle = PAL.skin; g.fillRect(2, 1, 8, 4);
    g.fillStyle = PAL.cap; g.fillRect(1, 0, 10, 3); g.fillRect(0, 3, 3, 1);
    g.fillStyle = PAL.dark; g.fillRect(8, 2, 1, 1); g.fillRect(4, 4, 4, 1);
    g.fillStyle = shirt; g.fillRect(2, 5, 8, 3);
    g.fillStyle = overall; g.fillRect(3, 8, 6, 4);
    g.fillStyle = PAL.shoe;
    if (step === 0) { g.fillRect(1, 12, 4, 2); g.fillRect(7, 12, 4, 2); }
    else if (step === 1) { g.fillRect(0, 12, 5, 2); g.fillRect(6, 11, 5, 3); }
    else if (step === 2) { g.fillRect(2, 11, 4, 3); g.fillRect(8, 12, 4, 2); }
    else { g.fillRect(1, 11, 5, 3); g.fillRect(6, 12, 4, 2); }
  }
  g.restore();
}

function drawEnemy(e) {
  const x = Math.round(e.x), y = Math.round(e.y);
  if (e.t === 'goomba') {
    if (e.squash > 0) {
      g.fillStyle = '#8a4b1a'; g.fillRect(x, y + 8, 14, 6);
      g.fillStyle = '#2a1710'; g.fillRect(x + 3, y + 10, 2, 1); g.fillRect(x + 9, y + 10, 2, 1);
      return;
    }
    g.fillStyle = '#8a4b1a';
    g.beginPath(); g.arc(x + 7, y + 7, 7, Math.PI, 0); g.fill();
    g.fillRect(x, y + 7, 14, 4);
    g.fillStyle = '#f7f2e0'; g.fillRect(x + 2, y + 4, 4, 4); g.fillRect(x + 8, y + 4, 4, 4);
    g.fillStyle = '#2a1710'; g.fillRect(x + 4, y + 5, 2, 3); g.fillRect(x + 8, y + 5, 2, 3);
    g.fillStyle = '#5c3210'; g.fillRect(x, y + 11, 5, 3); g.fillRect(x + 9, y + 11, 5, 3);
  } else if (e.t === 'koopa') {
    if (e.state === 'walk') {
      g.fillStyle = '#f2d24b'; g.fillRect(x + 3, y, 8, 7);
      g.fillStyle = '#2a1710'; g.fillRect(x + 8, y + 2, 2, 2);
      g.fillStyle = '#2f9c38'; g.fillRect(x, y + 6, 14, 10);
      g.fillStyle = '#1f7a28'; g.fillRect(x + 2, y + 8, 10, 6);
      g.fillStyle = '#f2d24b'; g.fillRect(x + 1, y + 14, 12, 2);
      g.fillStyle = '#f2d24b'; g.fillRect(x + 2, y + 16, 4, 2); g.fillRect(x + 8, y + 16, 4, 2);
    } else {
      g.fillStyle = '#2f9c38';
      g.beginPath(); g.arc(x + 7, y + 7, 7, Math.PI, 0); g.fill();
      g.fillRect(x, y + 6, 14, 5);
      g.fillStyle = '#1f7a28'; g.fillRect(x + 2, y + 4, 10, 5);
      g.fillStyle = '#f2d24b'; g.fillRect(x, y + 9, 14, 3);
      if (e.state === 'slide') { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 4, y + 4, 3, 4); }
    }
  } else if (e.t === 'piranha') {
    g.fillStyle = '#2f9c38'; g.fillRect(x + 4, y + 8, 6, 18);
    g.fillStyle = '#d62f2f';
    g.beginPath(); g.arc(x + 7, y + 8, 8, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x + 3, y + 5, 2, 2); g.fillRect(x + 9, y + 5, 2, 2); g.fillRect(x + 6, y + 2, 2, 2);
    g.fillStyle = '#fff'; g.fillRect(x + 2, y + 9, 10, 3);
    g.fillStyle = '#d62f2f'; g.fillRect(x + 4, y + 9, 2, 3); g.fillRect(x + 8, y + 9, 2, 3);
  } else if (e.t === 'boss') {
    g.save();
    if (e.hurtT > 0 && Math.floor(e.hurtT / 4) % 2 === 0) g.globalAlpha = 0.55;
    g.fillStyle = '#f2c53d'; g.fillRect(x + 4, y, 6, 6); g.fillRect(x + 24, y, 6, 6);
    g.fillStyle = '#5b8f2a';
    g.beginPath(); g.ellipse(x + 17, y + 22, 17, 20, 0, 0, 7); g.fill();
    g.fillStyle = '#3f6b1c';
    g.beginPath(); g.ellipse(x + 17, y + 26, 11, 13, 0, 0, 7); g.fill();
    g.fillStyle = '#eee5c8'; g.fillRect(x + 9, y + 6, 6, 6); g.fillRect(x + 19, y + 6, 6, 6);
    g.fillStyle = '#2a1710'; g.fillRect(x + 13, y + 8, 3, 3); g.fillRect(x + 20, y + 8, 3, 3);
    g.fillStyle = '#fff'; g.fillRect(x + 8, y + 20, 18, 4);
    g.fillStyle = '#d62f2f'; g.fillRect(x + 8, y + 24, 18, 4);
    g.fillStyle = '#2a1710'; g.fillRect(x + 12, y + 20, 2, 8); g.fillRect(x + 20, y + 20, 2, 8);
    g.fillStyle = '#f2c53d'; g.fillRect(x + 2, y + 36, 10, 8); g.fillRect(x + 22, y + 36, 10, 8);
    g.restore();
  }
}

function drawItem(it, t) {
  const x = Math.round(it.x), y = Math.round(it.y);
  if (it.t === 'mush') {
    g.fillStyle = '#e8392b'; g.beginPath(); g.arc(x + 7, y + 6, 7, Math.PI, 0); g.fill();
    g.fillRect(x, y + 5, 14, 3);
    g.fillStyle = '#fff'; g.fillRect(x + 2, y + 2, 3, 3); g.fillRect(x + 9, y + 3, 3, 2);
    g.fillStyle = '#f8e6c8'; g.fillRect(x + 2, y + 8, 10, 6);
    g.fillStyle = '#2a1710'; g.fillRect(x + 4, y + 10, 1, 2); g.fillRect(x + 9, y + 10, 1, 2);
  } else if (it.t === 'leaf') {
    g.save(); g.translate(x + 7, y + 7);
    g.rotate(Math.sin(t * 0.09) * 0.35);
    g.fillStyle = '#a9682c';
    g.beginPath(); g.ellipse(0, 0, 6, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#7c491b'; g.fillRect(-1, -7, 2, 14);
    g.fillStyle = '#d9a15c'; g.fillRect(-4, -3, 3, 2);
    g.restore();
  } else if (it.t === 'fire') {
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * Math.PI / 2;
      g.fillStyle = '#e8392b';
      g.beginPath(); g.arc(x + 7 + Math.cos(a) * 4, y + 6 + Math.sin(a) * 4, 3.4, 0, 7); g.fill();
    }
    g.fillStyle = '#f2c53d'; g.beginPath(); g.arc(x + 7, y + 6, 4, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 7, y + 6, 2, 0, 7); g.fill();
  } else if (it.t === 'ball') {
    g.fillStyle = '#ff7a1e'; g.beginPath(); g.arc(x + 4, y + 4, 4, 0, 7); g.fill();
    g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x + 4, y + 4, 2, 0, 7); g.fill();
  } else if (it.t === 'star') {
    g.save(); g.translate(x + 7, y + 7);
    g.rotate(Math.sin(t * 0.06) * 0.4);
    g.fillStyle = '#f2c53d';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 3.2 : 7.4, a = -Math.PI / 2 + i * Math.PI / 5;
      i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#fff7c8'; g.beginPath(); g.arc(-1.5, -2, 1.4, 0, 7); g.fill();
    g.restore();
  } else if (it.t === 'bfire') {
    g.fillStyle = '#ff4a1e'; g.beginPath(); g.arc(x + 5, y + 5, 5, 0, 7); g.fill();
    g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x + 5, y + 5, 2.6, 0, 7); g.fill();
  }
}

/* ---------------- 绘制：关卡 ---------------- */
function drawLevel(lv, cam, t) {
  const c0 = Math.max(0, Math.floor(cam / TW) - 1);
  const c1 = Math.min(lv.w - 1, Math.ceil((cam + VW) / TW) + 1);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = c0; tx <= c1; tx++) {
      const ch = lv.grid[ty][tx];
      if (ch === ' ') continue;
      let off = 0;
      const bp = lv.bumps.find(b => b.tx === tx && b.ty === ty);
      if (bp) off = -Math.sin((bp.t / 10) * Math.PI) * 8;
      drawTile(ch, Math.round(tx * TW - cam), Math.round(ty * TW + off), lv.def.theme, t, lv, tx, ty);
    }
  }
  // 旗杆 / 斧头
  const fx = lv.def.flag * TW;
  if (lv.def.theme === 'castle') {
    g.fillStyle = '#f2c53d'; g.fillRect(fx - cam + 4, 12 * TW, 8, 8);
    g.fillStyle = '#8a6a10'; g.fillRect(fx - cam + 6, 12 * TW + 6, 4, 10);
  } else {
    g.fillStyle = '#c8d2e8'; g.fillRect(fx - cam + 6, 5 * TW, 3, 8 * TW);
    g.fillStyle = '#e8392b';
    g.beginPath(); g.moveTo(fx - cam + 9, 5 * TW + 4); g.lineTo(fx - cam + 9 + 20, 5 * TW + 10);
    g.lineTo(fx - cam + 9, 5 * TW + 16); g.fill();
    g.fillStyle = '#f2c53d'; g.beginPath(); g.arc(fx - cam + 7.5, 5 * TW - 2, 4, 0, 7); g.fill();
  }
  // 金币
  lv.coins.forEach(c => {
    if (c.got) return;
    const sx = c.x - cam;
    if (sx < -20 || sx > VW + 20) return;
    const wob = Math.abs(Math.cos(t * 0.1 + c.t));
    g.fillStyle = '#f2c53d';
    g.fillRect(sx + 3 - wob * 3, c.y, 4 + wob * 6, 10);
    g.fillStyle = '#fff3a8'; g.fillRect(sx + 4 - wob * 3, c.y + 1, 2, 8);
  });
}

function drawParticles(lv, cam) {
  lv.fx.forEach(f => {
    if (f.t === 'text') {
      g.font = 'bold 8px monospace'; g.fillStyle = '#fff';
      g.fillText(f.txt, Math.round(f.x - cam), Math.round(f.y));
    } else if (f.t === 'coin') {
      g.fillStyle = '#f2c53d'; g.fillRect(Math.round(f.x - cam), Math.round(f.y), 8, 10);
      g.fillStyle = '#fff3a8'; g.fillRect(Math.round(f.x - cam + 2), Math.round(f.y + 1), 2, 8);
    } else {
      g.fillStyle = f.c || '#e0b070';
      g.fillRect(Math.round(f.x - cam), Math.round(f.y), 3, 3);
    }
  });
}

/* ---------------- HUD ---------------- */
function drawHUD(lv, p) {
  g.fillStyle = 'rgba(0,0,0,.58)'; g.fillRect(0, 0, VW, 13);
  txt('MARIO ' + String(Game.score).padStart(6, '0'), 4, 3, 8, '#fff');
  g.fillStyle = '#f2c53d'; g.beginPath(); g.arc(96, 6.5, 3, 0, 7); g.fill();
  txt('×' + String(Game.coins).padStart(2, '0'), 101, 3, 8, '#fff');
  txt(lv.def.id, 132, 3, 8, '#fff');
  txt('TIME ' + Math.max(0, Math.ceil(Game.timeLeft / 24)), 168, 3, 8, '#fff');
  txt('×' + Game.lives, 227, 3, 8, '#fff');
  // 小马里奥头像当生命图标
  drawMario(214, 0, 0, 1, 0, 0);
  // 状态
  const formName = ['', '蘑菇', '尾巴', '火焰'][p.form];
  if (p.form > 0) txt(formName, 4, 15, 8, '#a8ffb0');
}

/* ---------------- 场景：标题 ---------------- */
let tGlobal = 0;
function drawTitle() {
  drawBg('grass', tGlobal * 0.6);
  g.fillStyle = '#c46a1f'; g.fillRect(0, 13 * TW, VW, 32);
  g.fillStyle = '#4cc94c'; g.fillRect(0, 13 * TW, VW, 5);
  g.fillStyle = '#8a4a10';
  for (let i = 0; i < 16; i++) g.fillRect(i * 16, 13 * TW + 7, 1, 6);

  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 26px monospace';
  g.fillStyle = '#1a1a2a'; g.fillText('超级玛丽 3', VW / 2 + 2, 54);
  g.fillStyle = '#f2c53d'; g.fillText('超级玛丽 3', VW / 2, 52);
  txt('SUPER  MARIO  BROS.  3   ·   WEB REMAKE', VW / 2, 76, 8, '#ffffff', 'center');

  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(tGlobal / 42));
  g.globalAlpha = pulse;
  txt('按 Enter 开始', VW / 2, 112, 12, '#fff8d0', 'center');
  g.globalAlpha = 1;

  // 底部信息带
  g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(0, 196, VW, 30);
  txt('← → 移动    Z / 空格 跳    X 跑·火球·甩尾', VW / 2 + 16, 200, 7, '#e8f0ff', 'center');
  txt('P 暂停   R 重来本关   M 音乐开关', VW / 2 + 16, 212, 7, '#b9c9e6', 'center');
  txt('最高分 ' + String(Math.max(Game.best, Game.score)).padStart(6, '0'), VW / 2, 160, 8, '#ffe9a8', 'center');

  // 主角最后画，别被信息带盖住
  drawMario(28, 13 * TW - 26, (Math.floor(tGlobal / 90) % 4 === 0) ? 2 : 1, 1, tGlobal / 6, 0);
  g.textAlign = 'left'; g.textBaseline = 'top';
}

/* ---------------- 场景：世界地图 ---------------- */
function drawMap() {
  drawBg('grass', 0);
  // 底部草地
  g.fillStyle = '#3fbf5f'; g.fillRect(0, VH - 26, VW, 26);
  g.fillStyle = '#2f9c48'; g.fillRect(0, VH - 8, VW, 8);

  const ns = WORLD.nodes;
  // 路径：先画深色底再画虚线，浅背景上也看得见
  g.lineWidth = 4; g.strokeStyle = 'rgba(110,70,30,.35)'; g.setLineDash([2, 6]);
  g.beginPath(); ns.forEach((n, i) => i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y)); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,240,200,.9)'; g.setLineDash([4, 6]);
  g.beginPath(); ns.forEach((n, i) => i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y)); g.stroke();
  g.setLineDash([]);

  const unlocked = unlockedCount();
  ns.forEach((n, i) => {
    const done = !!Game.cleared[n.lv];
    const open = i <= unlocked;
    // 台座
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(n.x - 16, n.y + 6, 32, 6);
    g.fillStyle = done ? '#9aa3b5' : (open ? '#c46a1f' : '#6b7280');
    g.fillRect(n.x - 15, n.y - 2, 30, 14);
    g.fillStyle = done ? '#c8d0dd' : (open ? '#e08a35' : '#8a919e');
    g.fillRect(n.x - 15, n.y - 6, 30, 5);

    if (done) {
      // 已过关：小旗
      g.fillStyle = '#f2c53d'; g.fillRect(n.x - 1, n.y - 32, 2, 26);
      g.fillStyle = '#3fbf5f';
      g.beginPath(); g.moveTo(n.x + 1, n.y - 32); g.lineTo(n.x + 15, n.y - 26);
      g.lineTo(n.x + 1, n.y - 20); g.fill();
      txt(n.lv, n.x, n.y - 15, 7, '#e9eefc', 'center');
    } else if (open) {
      // 可进：白牌 + 关卡号
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(n.x - 13, n.y - 31, 26, 18);
      g.fillStyle = '#fff'; g.fillRect(n.x - 14, n.y - 32, 26, 17);
      g.fillStyle = '#c8d2e8'; g.fillRect(n.x - 14, n.y - 16, 26, 1);
      txt(n.lv, n.x, n.y - 30, 8, '#1a1a2a', 'center');
    } else {
      g.fillStyle = 'rgba(20,20,30,.45)'; g.fillRect(n.x - 14, n.y - 32, 26, 17);
      g.fillStyle = '#7e8697';
      g.fillRect(n.x - 4, n.y - 27, 6, 7); g.fillRect(n.x + 2, n.y - 27, 6, 7);
    }
  });

  // 玩家指示：站在节点上方偏左，别把牌子挡住
  const n = ns[Game.node];
  drawMario(n.x - 32, n.y - 24, Game.p ? Game.p.form : 0, 1, tGlobal / 9, 0);

  // 顶部信息
  g.fillStyle = 'rgba(0,0,0,.58)'; g.fillRect(0, 0, VW, 13);
  txt('MARIO ' + String(Game.score).padStart(6, '0'), 4, 3, 8, '#fff');
  txt('×' + String(Game.coins).padStart(2, '0'), 101, 3, 8, '#fff');
  g.fillStyle = '#f2c53d'; g.beginPath(); g.arc(96, 6.5, 3, 0, 7); g.fill();
  drawMario(214, 0, 0, 1, 0, 0);
  txt('×' + Game.lives, 227, 3, 8, '#fff');

  g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, VH - 18, VW, 18);
  txt('WORLD 1', 6, VH - 14, 8, '#fff8d0');
  if (Object.keys(Game.cleared).length >= WORLD.nodes.length) {
    g.fillStyle = 'rgba(20,30,10,.55)'; g.fillRect(0, 96, VW, 34);
    txt('全部通关！', VW / 2, 102, 14, '#f2c53d', 'center');
    txt('总分 ' + Game.score + '   按 Enter 可再打一遍', VW / 2, 120, 8, '#e8f0ff', 'center');
  }
  if (Math.floor(tGlobal / 30) % 2 === 0) txt('← → 选关    Enter 进入', VW / 2, VH - 14, 8, '#fff', 'center');
}

function unlockedCount() {
  let n = 0;
  for (let i = 0; i < WORLD.nodes.length; i++) {
    if (Game.cleared[WORLD.nodes[i].lv]) n = i + 1; else break;
  }
  return Math.min(n, WORLD.nodes.length - 1);
}

/* ---------------- 场景：过关抽卡 ---------------- */
const CARDS = [
  { t: 'mush', name: '蘑菇', color: '#e8392b' },
  { t: 'fire', name: '火焰花', color: '#ff8a2e' },
  { t: 'star', name: '星星', color: '#f2c53d' }
];
function drawClear() {
  const lv = Game.lv;
  drawBg(lv.def.theme, Game.cam);
  drawLevel(lv, Game.cam, lv.t);
  drawMario(Math.round(Game.p.x - Game.cam), Math.round(Game.p.y), Game.p.form, 1, 0, 0);

  g.fillStyle = 'rgba(0,0,0,.66)'; g.fillRect(0, 0, VW, VH);
  txt('过关！', VW / 2, 26, 16, '#f2c53d', 'center');
  txt(lv.def.name + '（' + lv.def.id + '）  +5000', VW / 2, 50, 8, '#dfe7f7', 'center');

  const cy = 118, cw = 46, gap = 10;
  const x0 = VW / 2 - (cw * 3 + gap * 2) / 2;
  const spin = Math.floor(tGlobal / 4);
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (cw + gap);
    const idx = Game.cardStopped ? i : (spin + i) % 3;
    const card = CARDS[idx];
    const isPicked = Game.cardStopped && i === 1;
    // 卡框
    g.fillStyle = card.color;
    g.fillRect(x, cy - 34, cw, 68);
    g.fillStyle = isPicked ? '#fffdf0' : 'rgba(255,255,255,.92)';
    g.fillRect(x + 3, cy - 31, cw - 6, 62);
    if (isPicked) {
      g.strokeStyle = '#f2c53d'; g.lineWidth = 2; g.strokeRect(x + 4, cy - 30, cw - 8, 60);
    }
    // 图案放大 2 倍
    g.save();
    g.translate(x + cw / 2 - 14, cy - 26);
    g.scale(2, 2);
    drawItem({ x: 0, y: 0, t: card.t }, tGlobal);
    g.restore();
    txt(card.name, x + cw / 2, cy + 38, 9, '#dfe7f7', 'center');

  }

  if (!Game.cardStopped) {
    if (Math.floor(tGlobal / 20) % 2 === 0) txt('按 Enter 停牌', VW / 2, 176, 9, '#fff', 'center');
  } else {
    txt(Game.cardMsg || '', VW / 2, 168, 9, '#a8ffb0', 'center');
    if (Math.floor(tGlobal / 20) % 2 === 0) txt('按 Enter 返回地图', VW / 2, 184, 8, '#fff', 'center');
  }
}

/* ---------------- 场景：结束 / 暂停 ---------------- */
function drawGameOver() {
  g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 16px monospace'; g.fillStyle = '#e8392b';
  g.fillText('GAME OVER', VW / 2, 100);
  g.font = 'bold 9px monospace'; g.fillStyle = '#fff';
  g.fillText('得分 ' + Game.score, VW / 2, 126);
  if (Math.floor(tGlobal / 30) % 2 === 0) g.fillText('按 Enter 重新开始', VW / 2, 156);
  g.textAlign = 'left'; g.textBaseline = 'top';
}
function drawPause() {
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, VW, VH);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 14px monospace'; g.fillStyle = '#fff';
  g.fillText('暂停', VW / 2, 104);
  g.font = '8px monospace'; g.fillStyle = '#c8d2e8';
  g.fillText('P 继续 ｜ R 重来本关 ｜ M 音乐开关', VW / 2, 126);
  g.textAlign = 'left'; g.textBaseline = 'top';
}

/* ---------------- 逻辑：世界更新 ---------------- */
function updatePlay() {
  const lv = Game.lv, p = Game.p;
  lv.t++;
  if (!p.dead) {
    Game.timeLeft--;
    if (Game.timeLeft <= 0) { Game.timeLeft = 0; killPlayer(p); }
  }
  updatePlayer(p, lv, 1);

  lv.enemies.forEach(e => { if (Math.abs(e.x - p.x) < 420) updateEnemy(e, lv, p); });
  lv.items.forEach(it => updateItem(it, lv, p));

  // 清理
  lv.enemies = lv.enemies.filter(e => e.t === 'boss' ? e.dead < 40 : !e.dead);
  lv.items = lv.items.filter(i => !i.dead);
  lv.fx = lv.fx.filter(f => --f.life > 0);
  lv.bumps = lv.bumps.filter(b => { b.t++; return b.t < 10; });

  // 相机
  const target = p.x - 96 + p.vx * 6;
  Game.cam += (target - Game.cam) * 0.18;
  Game.cam = Math.max(0, Math.min(lv.w * TW - VW, Game.cam));

  // 到达终点
  if (!p.dead && p.x + p.w > lv.def.flag * TW + 4) levelClear();

  // 死亡流程
  if (Game.mode === 'dead') {
    Game.deadT++;
    if (Game.deadT > 110) {
      Game.lives--;
      if (Game.p) { Game.p.form = 0; Game.p.h = 14; }
      if (Game.lives < 0) { Game.mode = 'gameover'; Game.save(); }
      else { Game.mode = 'map'; Game.save(); }
      Game.deadT = 0;
    }
  }
}

function levelClear() {
  const id = Game.lv.def.id;
  const first = !Game.cleared[id];
  Game.cleared[id] = true;
  Game.score += 5000;
  Game.mode = 'clear';
  Game.clearT = 0;
  Game.cardIdx = 0; Game.cardStopped = 0; Game.cardResult = 0; Game.cardMsg = '';
  Snd.sfx('clear');
  if (first) {
    const idx = WORLD.nodes.findIndex(n => n.lv === id);
    if (idx >= 0 && Game.node <= idx) Game.node = Math.min(idx + 1, WORLD.nodes.length - 1);
  }
  Game.save();
}

/* ---------------- 主循环 ---------------- */
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(64, now - last); last = now;
  acc += dt;
  let steps = 0;
  while (acc >= 16.6667 && steps < 4) { tick(); acc -= 16.6667; steps++; }
  render();
  requestAnimationFrame(frame);
}

function tick() {
  tGlobal++;
  Snd.tickMusic();

  if (pressed('pause') && (Game.mode === 'play' || Game.mode === 'pause')) {
    Game.mode = Game.mode === 'play' ? 'pause' : 'play';
    Snd.sfx('pause');
  }

  switch (Game.mode) {
    case 'title':
      if (pressed('start') || pressed('jump')) { Game.mode = 'map'; Snd.sfx('coin'); }
      break;
    case 'map':
      if (pressed('left') && Game.node > 0) Game.node--;
      if (pressed('right') && Game.node < unlockedCount()) Game.node++;
      if (pressed('start') || pressed('jump')) {
        const n = WORLD.nodes[Game.node];
        if (Game.node <= unlockedCount()) {
          Game.startLevel(n.lv, Game.p ? Game.p.form : 0);
        }
      }
      break;
    case 'play': updatePlay(); break;
    case 'dead': updatePlay(); break;
    case 'clear':
      Game.clearT++;
      if (Game.clearT > 40) {
        if (!Game.cardStopped) {
          if (Game.clearT % 3 === 0) Game.cardIdx = (Game.cardIdx + 1) % 3;
          if (pressed('start') || pressed('jump') || (pressed('run'))) stopCard();
          if (Game.clearT > 300) stopCard();
        } else if (pressed('start') || pressed('jump')) {
          Game.mode = 'map';
          Game.save();
        }
      }
      break;
    case 'gameover':
      if (pressed('start') || pressed('jump')) {
        Game.score = 0; Game.coins = 0; Game.lives = 3; Game.node = 0; Game.cleared = {};
        Game.mode = 'title'; Game.save();
      }
      break;
  }

  for (const k in K) KP[k] = K[k];
}

function stopCard() {
  Game.cardStopped = 1;
  Game.cardResult = Math.floor(Math.random() * 3);
  const c = CARDS[Game.cardResult];
  if (c.t === 'mush') { Game.score += 1000; Game.cardMsg = '蘑菇卡：+1000 分'; }
  else if (c.t === 'fire') { Game.score += 2000; Game.cardMsg = '火焰花卡：+2000 分'; }
  else { Game.lives++; Game.cardMsg = '星星卡：生命 +1'; }
  Snd.sfx(c.t === 'star' ? '1up' : 'coin');
}

function drawWorld(lv, p, cam) {
  drawBg(lv.def.theme, cam);
  g.save(); g.translate(-Math.round(cam), 0);
  // 食人花先画，管子后画才盖得住它下半截
  lv.enemies.forEach(e => { if (!e.dead && e.t === 'piranha') drawEnemy(e); });
  g.restore();

  drawLevel(lv, cam, lv.t);

  g.save(); g.translate(-Math.round(cam), 0);
  lv.items.forEach(it => { if (it.t !== 'ball' && it.t !== 'bfire') drawItem(it, lv.t); });
  lv.enemies.forEach(e => { if (e.t !== 'piranha' && (!e.dead || e.t === 'boss')) drawEnemy(e); });
  lv.items.forEach(it => { if (it.t === 'ball' || it.t === 'bfire') drawItem(it, lv.t); });
  g.restore();

  if (p && !(p.invuln > 0 && Math.floor(tGlobal / 3) % 2 === 0)) {
    drawMario(Math.round(p.x - cam), Math.round(p.y), p.form, p.facing, p.anim, p.spinning > 0);
  }
  if (p && p.spinning > 8) {
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x - cam + 6, p.y + p.h / 2, 15, 0, 7); g.stroke();
  }
  drawParticles(lv, cam);
}

function render() {
  g.clearRect(0, 0, VW, VH);
  switch (Game.mode) {
    case 'title': drawTitle(); break;
    case 'map': drawMap(); break;
    case 'pause':
      drawWorld(Game.lv, Game.p, Game.cam);
      drawHUD(Game.lv, Game.p);
      drawPause(); break;
    case 'clear': drawClear(); break;
    case 'gameover': drawGameOver(); break;
    default:
      drawWorld(Game.lv, Game.p, Game.cam);
      drawHUD(Game.lv, Game.p);
  }
}

/* ---------------- 启动 ---------------- */
Game.load();
cv.addEventListener('pointerdown', () => Snd.init(), { once: true });
addEventListener('keydown', () => Snd.init(), { once: true });
requestAnimationFrame(frame);

window.__GAME__ = Game; // 便于调试
})();
