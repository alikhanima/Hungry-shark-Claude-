/* ==========================================================================
   SHARK RUSH — game.js
   Vanilla JS + Canvas 2D. No external assets or dependencies.
   Structure: utils -> audio -> save -> data -> state -> input -> world ->
   AI/physics -> combat/progression -> render -> UI wiring -> main loop.
   ========================================================================== */
(function () {
  'use strict';

  /* ============================== UTILITIES ============================== */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
  const distance = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
  const TAU = Math.PI * 2;
  function angleLerp(a, b, t) {
    let diff = ((b - a + Math.PI * 3) % TAU) - Math.PI;
    return a + diff * t;
  }
  function approach(cur, target, rate, dt) {
    const t = 1 - Math.exp(-rate * dt);
    return lerp(cur, target, t);
  }
  function haptic(ms) {
    if (Save.settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  /* ================================ AUDIO ================================ */
  const AudioSys = (() => {
    let ctx = null, master = null, sfxGain = null, ambGain = null, ambNodes = null;
    function init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
      ambGain = ctx.createGain(); ambGain.gain.value = 0.22; ambGain.connect(master);
    }
    function resume() {
      init();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
    }
    function tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.3, slideTo = null, delay = 0 }) {
      if (!ctx || !Save.settings.sfx) return;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t0);
      if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(sfxGain);
      osc.start(t0); osc.stop(t0 + dur + 0.03);
    }
    function noiseBurst({ dur = 0.2, gain = 0.25, filterFreq = 1200, delay = 0 }) {
      if (!ctx || !Save.settings.sfx) return;
      const t0 = ctx.currentTime + delay;
      const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(sfxGain);
      src.start(t0);
    }
    function bite(comboLevel) {
      const pitch = 1 + Math.min(comboLevel, 12) * 0.045;
      tone({ freq: 190 * pitch, type: 'square', dur: 0.09, gain: 0.32, slideTo: 70 * pitch });
      noiseBurst({ dur: 0.1, gain: 0.16, filterFreq: 2200 });
    }
    function coinPickup() { tone({ freq: 880, type: 'triangle', dur: 0.09, gain: 0.22, slideTo: 1400 }); }
    function comboUp() { tone({ freq: 520, type: 'sawtooth', dur: 0.12, gain: 0.18, slideTo: 940 }); }
    function levelUp() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.26, delay: i * 0.09 })); }
    function damage() { tone({ freq: 160, type: 'sawtooth', dur: 0.25, gain: 0.32, slideTo: 50 }); noiseBurst({ dur: 0.18, gain: 0.2, filterFreq: 500 }); }
    function boostWhoosh() { noiseBurst({ dur: 0.28, gain: 0.16, filterFreq: 2600 }); }
    function uiClick() { tone({ freq: 600, type: 'sine', dur: 0.06, gain: 0.18, slideTo: 800 }); }
    function bossWarn() { tone({ freq: 110, type: 'sawtooth', dur: 0.5, gain: 0.28, slideTo: 85 }); }
    function bossHit() { tone({ freq: 210, type: 'square', dur: 0.12, gain: 0.28, slideTo: 90 }); }
    function bossDefeatSnd() { [220, 330, 440, 660, 880].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.28, delay: i * 0.11 })); }
    function missionDone() { tone({ freq: 700, type: 'triangle', dur: 0.14, gain: 0.24, slideTo: 1100 }); tone({ freq: 1050, type: 'triangle', dur: 0.18, gain: 0.18, delay: 0.1 }); }
    function deathSting() { [300, 240, 180, 120].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.28, gain: 0.28, delay: i * 0.14, slideTo: f * 0.6 })); }
    function startAmbience() {
      if (!ctx || ambNodes || !Save.settings.ambience) return;
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 58;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 87;
      const g = ctx.createGain(); g.gain.value = 0.0;
      o1.connect(g); o2.connect(g); g.connect(ambGain);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.2);
      o1.start(); o2.start();
      ambNodes = { o1, o2, g };
    }
    function stopAmbience() {
      if (!ambNodes) return;
      const { o1, o2, g } = ambNodes;
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 450);
      ambNodes = null;
    }
    function refreshAmbience() { if (Save.settings.ambience) startAmbience(); else stopAmbience(); }
    return { resume, bite, coinPickup, comboUp, levelUp, damage, boostWhoosh, uiClick, bossWarn, bossHit, bossDefeatSnd, missionDone, deathSting, startAmbience, stopAmbience, refreshAmbience };
  })();

  /* ================================ SAVE ================================= */
  const SAVE_KEY = 'sharkRushSave_v1';
  function defaultSave() {
    return {
      level: 1, xp: 0, coins: 0,
      upgrades: { speed: 0, bite: 0, health: 0, boost: 0, hunger: 0, coinMult: 0 },
      missions: {}, missionsDone: {},
      bestCombo: 0,
      zonesUnlocked: [0],
      settings: { sfx: true, ambience: true, shake: true, haptics: true }
    };
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const p = JSON.parse(raw);
      const d = defaultSave();
      return Object.assign(d, p, {
        upgrades: Object.assign(d.upgrades, p.upgrades || {}),
        missions: p.missions || {},
        missionsDone: p.missionsDone || {},
        settings: Object.assign(d.settings, p.settings || {}),
        zonesUnlocked: p.zonesUnlocked || [0]
      });
    } catch (e) { return defaultSave(); }
  }
  let Save = loadSave();
  let saveTimer = 0;
  function persistSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Save)); } catch (e) {}
  }

  /* ================================ DATA ================================= */
  const TIER_NAMES = ['tiny', 'small', 'medium', 'large', 'apex'];

  const LEVELS = [
    { title: 'Little Hunter', xpToNext: 40, scale: 1.00, maxTier: 0, speed: 150 },
    { title: 'Reef Hunter', xpToNext: 90, scale: 1.28, maxTier: 1, speed: 158 },
    { title: 'Predator', xpToNext: 170, scale: 1.60, maxTier: 2, speed: 166 },
    { title: 'Deep Hunter', xpToNext: 280, scale: 1.95, maxTier: 2, speed: 174 },
    { title: 'Apex', xpToNext: 440, scale: 2.35, maxTier: 3, speed: 182 },
    { title: 'Titan', xpToNext: 680, scale: 2.85, maxTier: 3, speed: 190 },
    { title: 'Leviathan', xpToNext: Infinity, scale: 3.40, maxTier: 4, speed: 200 }
  ];

  // Custom fish registered by new-fish.js are merged into this list.
  const CUSTOM_FISH = Array.isArray(window.SHARK_RUSH_CUSTOM_FISH) ? window.SHARK_RUSH_CUSTOM_FISH : [];
  const CREATURES = [
    { id: 'minnow', name: 'Minnow', tier: 0, r: 9, speed: 76, turn: 4.2, xp: 2, coin: 1, body: 'fish', colA: '#8fe3ff', colB: '#2f8fb0', behavior: 'school' },
    { id: 'shrimp', name: 'Shrimp', tier: 0, r: 7, speed: 42, turn: 3, xp: 2, coin: 1, body: 'shrimp', colA: '#ffc2d1', colB: '#d1607f', behavior: 'wander' },
    { id: 'tinysquid', name: 'Tiny Squid', tier: 0, r: 10, speed: 58, turn: 3, xp: 3, coin: 1, body: 'squid', colA: '#d9b8ff', colB: '#7c4fc9', behavior: 'wander' },
    { id: 'reeffish', name: 'Reef Fish', tier: 1, r: 16, speed: 92, turn: 4, xp: 6, coin: 2, body: 'fish', colA: '#ffd166', colB: '#e0651f', behavior: 'school' },
    { id: 'crab', name: 'Crab', tier: 1, r: 14, speed: 34, turn: 2, xp: 5, coin: 2, body: 'crab', colA: '#ff8a5c', colB: '#a53a1d', behavior: 'hide' },
    { id: 'smjelly', name: 'Small Jelly', tier: 1, r: 15, speed: 22, turn: 1.5, xp: 5, coin: 2, body: 'jelly', colA: '#d6b3ff', colB: '#8a5fd1', behavior: 'drift' },
    { id: 'barrelfin', name: 'Barrelfin', tier: 2, r: 27, speed: 100, turn: 3, xp: 14, coin: 5, body: 'fish', colA: '#5cc9ff', colB: '#1f6fa8', behavior: 'wander' },
    { id: 'glideray', name: 'Glide Ray', tier: 2, r: 32, speed: 76, turn: 2, xp: 16, coin: 5, body: 'ray', colA: '#8b9bab', colB: '#3f4d59', behavior: 'glide' },
    { id: 'ironscale', name: 'Ironscale', tier: 2, r: 25, speed: 64, turn: 2.4, xp: 15, coin: 5, body: 'fish', colA: '#a8b6c2', colB: '#525f6b', behavior: 'wander' },
    { id: 'finback', name: 'Finback Predator', tier: 3, r: 40, speed: 130, turn: 3.4, xp: 34, coin: 12, body: 'predator', colA: '#4a5c6e', colB: '#151d25', behavior: 'predator', dangerous: true, dmg: 14 },
    { id: 'giantsquid', name: 'Giant Squid', tier: 3, r: 44, speed: 66, turn: 2, xp: 38, coin: 14, body: 'squid', colA: '#b03a6b', colB: '#4c1730', behavior: 'ambush', dangerous: true, dmg: 16 },
    { id: 'sabereel', name: 'Sabertooth Eel', tier: 3, r: 34, speed: 140, turn: 4.2, xp: 36, coin: 13, body: 'eel', colA: '#4c6b3f', colB: '#182714', behavior: 'predator', dangerous: true, dmg: 15 },
    { id: 'voidfin', name: 'Voidfin Colossus', tier: 4, r: 62, speed: 88, turn: 2.4, xp: 92, coin: 40, body: 'predator', colA: '#2c1a34', colB: '#0a060f', behavior: 'predator', dangerous: true, dmg: 30 },
    { id: 'abyssray', name: 'Abyssal Ray', tier: 4, r: 68, speed: 58, turn: 1.6, xp: 96, coin: 42, body: 'ray', colA: '#141c24', colB: '#04070a', behavior: 'glide', dangerous: true, dmg: 28 }
  ].concat(CUSTOM_FISH);
  const CREATURES_BY_TIER = TIER_NAMES.map((_, i) => CREATURES.filter(c => c.tier === i));

  const ZONES = [
    { id: 0, name: 'Sunlit Reef', x0: 0, x1: 3200, sky: ['#5fd7e6', '#0b6e86'], tiers: [0, 1], deco: 'reef' },
    { id: 1, name: 'Kelp Forest', x0: 3200, x1: 6800, sky: ['#1f7a5c', '#0a2f28'], tiers: [0, 1, 2], deco: 'kelp' },
    { id: 2, name: 'Deep Trench', x0: 6800, x1: 10200, sky: ['#123a5e', '#04121f'], tiers: [1, 2, 3], deco: 'trench' },
    { id: 3, name: 'The Abyss', x0: 10200, x1: 14000, sky: ['#050b16', '#000105'], tiers: [2, 3, 4], deco: 'abyss', boss: true }
  ];
  const WORLD = { w: ZONES[ZONES.length - 1].x1, h: 2500 };

  const MISSIONS = [
    { id: 'eat20small', text: 'Eat 20 small fish', target: 20, type: 'eatTier', tiers: [0, 1], coin: 20, xp: 10 },
    { id: 'reachKelp', text: 'Reach the Kelp Forest', target: 1, type: 'zone', zone: 1, coin: 30, xp: 15 },
    { id: 'combo10', text: 'Get a x10 combo', target: 10, type: 'combo', coin: 40, xp: 20 },
    { id: 'treasure5', text: 'Collect 5 treasures', target: 5, type: 'treasure', coin: 35, xp: 15 },
    { id: 'eat3medium', text: 'Eat 3 medium creatures', target: 3, type: 'eatTier', tiers: [2], coin: 50, xp: 22 },
    { id: 'survive2m', text: 'Survive for 2 minutes', target: 120, type: 'survive', coin: 45, xp: 20 },
    { id: 'defeatPred', text: 'Defeat a predator', target: 1, type: 'eatDangerous', coin: 80, xp: 35 },
    { id: 'reachAbyss', text: 'Reach the Abyss', target: 1, type: 'zone', zone: 3, coin: 150, xp: 70 }
  ];

  const UPGRADES = [
    { id: 'speed', name: 'Speed', desc: 'Swim faster', base: 20, mult: 1.6, max: 5, step: '+6% swim speed / lvl' },
    { id: 'bite', name: 'Bite Power', desc: 'More XP & coins per bite', base: 25, mult: 1.65, max: 5, step: '+10% bite yield / lvl' },
    { id: 'health', name: 'Health', desc: 'Take more hits', base: 22, mult: 1.6, max: 5, step: '+20 max health / lvl' },
    { id: 'boost', name: 'Boost', desc: 'Bigger, faster boost meter', base: 24, mult: 1.6, max: 5, step: '+15% boost power / lvl' },
    { id: 'hunger', name: 'Hunger Capacity', desc: 'Stay full longer', base: 18, mult: 1.55, max: 5, step: '+20% hunger capacity / lvl' },
    { id: 'coinMult', name: 'Coin Multiplier', desc: 'Earn more coins', base: 30, mult: 1.7, max: 5, step: '+12% coins / lvl' }
  ];
  function upgradeCost(u, lvl) { return Math.round(u.base * Math.pow(u.mult, lvl)); }

  /* =============================== STATE ================================= */
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = 0, cssH = 0;

  const Input = { moveX: 0, moveY: 0, boosting: false, dragging: false, pointerId: null };

  const Run = {
    state: 'boot', // boot, menu, playing, paused, levelup(non-blocking overlay flag), gameover
    prevScreen: 'mainMenu',
    shark: null,
    creatures: [],
    treasures: [],
    particles: [],
    schools: [],
    boss: null, bossState: 'none', bossCooldown: 0,
    camera: { x: 400, y: WORLD.h / 2 },
    shake: 0,
    comboCount: 0, comboTimer: 0, bestComboRun: 0,
    runTimer: 0, coinsEarnedRun: 0, xpEarnedRun: 0,
    zoneIndex: 0, lastZoneIndex: -1,
    hudTimer: 0,
    time: 0
  };

  const PART_POOL_SIZE = 420;
  const PARTS = [];
  for (let i = 0; i < PART_POOL_SIZE; i++) PARTS.push({ active: false });

  /* ============================ CANVAS SIZING ============================= */
  function resize() {
    cssW = window.innerWidth; cssH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  /* =============================== INPUT ================================= */
  (function setupInput() {
    const zone = $('joystickZone'), base = $('joystickBase'), nub = $('joystickNub');
    const MAXR = 46;
    let baseCX = 0, baseCY = 0;

    function defaultBasePos() {
      const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-l')) || 0;
      const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
      return { x: safeL + 28 + 54, y: cssH - (safeB + 28 + 54) };
    }
    function placeBase(x, y) { base.style.left = x + 'px'; base.style.top = y + 'px'; baseCX = x; baseCY = y; }
    const dp0 = defaultBasePos(); placeBase(dp0.x, dp0.y);
    window.addEventListener('resize', () => { if (!Input.dragging) { const d = defaultBasePos(); placeBase(d.x, d.y); } });

    function setNub(dx, dy) { nub.style.transform = `translate(${dx}px,${dy}px)`; }

    function onDown(e) {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      Input.dragging = true; Input.pointerId = t.identifier != null ? t.identifier : 'mouse';
      placeBase(t.clientX, t.clientY);
      base.style.opacity = '1';
      onMove(e);
      e.preventDefault();
    }
    function onMove(e) {
      if (!Input.dragging) return;
      const t = e.changedTouches ? [...e.changedTouches].find(tt => tt.identifier === Input.pointerId) || e.changedTouches[0] : e;
      let dx = t.clientX - baseCX, dy = t.clientY - baseCY;
      const m = Math.hypot(dx, dy);
      if (m > MAXR) { dx = dx / m * MAXR; dy = dy / m * MAXR; }
      setNub(dx, dy);
      const nx = dx / MAXR, ny = dy / MAXR;
      const mag = Math.hypot(nx, ny);
      if (mag < 0.14) { Input.moveX = 0; Input.moveY = 0; }
      else { Input.moveX = nx; Input.moveY = ny; }
      e.preventDefault();
    }
    function onUp(e) {
      Input.dragging = false; Input.moveX = 0; Input.moveY = 0;
      setNub(0, 0);
      const d = defaultBasePos(); placeBase(d.x, d.y);
      base.style.opacity = '';
      e.preventDefault();
    }
    zone.addEventListener('touchstart', onDown, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onUp, { passive: false });
    zone.addEventListener('touchcancel', onUp, { passive: false });
    zone.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', (e) => { if (Input.dragging) onMove(e); });
    window.addEventListener('mouseup', (e) => { if (Input.dragging) onUp(e); });

    const boostBtn = $('boostBtn');
    function boostOn(e) { Input.boosting = true; e.preventDefault(); }
    function boostOff(e) { Input.boosting = false; if (e) e.preventDefault(); }
    boostBtn.addEventListener('touchstart', boostOn, { passive: false });
    boostBtn.addEventListener('touchend', boostOff, { passive: false });
    boostBtn.addEventListener('touchcancel', boostOff, { passive: false });
    boostBtn.addEventListener('mousedown', boostOn);
    window.addEventListener('mouseup', boostOff);

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());
  })();

  /* ========================= WORLD DECOR (parallax) ======================= */
  const DECOR = [];
  (function genDecor() {
    const types = ['coral', 'seaweed', 'rock', 'cave', 'wreck', 'shell'];
    for (let i = 0; i < 260; i++) {
      const x = rand(0, WORLD.w);
      const zone = zoneAtX(x);
      const layer = pick([0.35, 0.35, 0.55, 0.55, 0.8]);
      DECOR.push({
        x, y: rand(WORLD.h * 0.55, WORLD.h - 30),
        type: zone.deco === 'abyss' && Math.random() < 0.3 ? 'rock' : pick(types),
        layer, size: rand(0.7, 1.8), hue: rand(-8, 8), seed: Math.random() * 10
      });
    }
  })();

  function zoneAtX(x) {
    for (const z of ZONES) if (x >= z.x0 && x < z.x1) return z;
    return ZONES[ZONES.length - 1];
  }

  /* =============================== SHARK ================================= */
  const SHARK_BASE_R = 22;
  function makeShark() {
    return {
      x: 260, y: WORLD.h / 2, vx: 0, vy: 0, angle: 0, facing: 1,
      scaleCur: LEVELS[Save.level - 1].scale, scaleTarget: LEVELS[Save.level - 1].scale,
      r: SHARK_BASE_R * LEVELS[Save.level - 1].scale,
      mouthOpen: 0, biteTimer: 0, lungeVX: 0, lungeVY: 0,
      boosting: false, boostMeter: 100, maxBoost: 100 * (1 + 0.15 * Save.upgrades.boost),
      hunger: 100, maxHunger: 100 * (1 + 0.2 * Save.upgrades.hunger),
      health: 100 + 20 * Save.upgrades.health, maxHealth: 100 + 20 * Save.upgrades.health,
      invuln: 0, damageFlash: 0, dead: false, deathTimer: 0,
      wagPhase: 0, tilt: 0
    };
  }
  function maxEatTier() { return LEVELS[Save.level - 1].maxTier; }
  function currentSpeed() {
    const base = LEVELS[Save.level - 1].speed * (1 + 0.06 * Save.upgrades.speed);
    return base;
  }

  /* ============================= PARTICLES ================================ */
  function spawnParticle(o) {
    let slot = null;
    for (let i = 0; i < PARTS.length; i++) if (!PARTS[i].active) { slot = PARTS[i]; break; }
    if (!slot) slot = PARTS[0];
    Object.assign(slot, { active: true, age: 0 }, o);
  }
  function burst(x, y, colA, colB, count, power) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(power * 0.3, power);
      spawnParticle({ type: 'burst', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 5), color: Math.random() < 0.5 ? colA : colB });
    }
  }
  function bubbleAt(x, y, n) {
    for (let i = 0; i < (n || 1); i++) {
      spawnParticle({ type: 'bubble', x: x + rand(-8, 8), y: y + rand(-6, 6), vx: rand(-8, 8), vy: rand(-70, -30), life: rand(0.6, 1.3), maxLife: 1.3, size: rand(2, 6) });
    }
  }
  function floatText(x, y, text, color, big) {
    spawnParticle({ type: 'text', x, y, vx: 0, vy: -34, life: 1.0, maxLife: 1.0, text, color, big: !!big });
  }
  function ringWarn(x, y, color, dur) {
    spawnParticle({ type: 'ring', x, y, life: dur, maxLife: dur, color, r0: 10 });
  }
  function sparkleAt(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      spawnParticle({ type: 'burst', x, y, vx: Math.cos(a) * rand(20, 70), vy: Math.sin(a) * rand(20, 70), life: rand(0.4, 0.7), maxLife: 0.7, size: rand(2, 4), color: '#ffdf8a' });
    }
  }
  function updateParticles(dt) {
    for (const p of PARTS) {
      if (!p.active) continue;
      p.age += dt; p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.type === 'burst') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= (1 - 3 * dt); p.vy *= (1 - 3 * dt); p.vy += 40 * dt; }
      else if (p.type === 'bubble') { p.x += p.vx * dt + Math.sin(p.age * 6) * 6 * dt; p.y += p.vy * dt; p.vy *= (1 - 0.5 * dt); }
      else if (p.type === 'text') { p.y += p.vy * dt; p.vy *= (1 - 1.2 * dt); }
      else if (p.type === 'ring') { /* purely time driven */ }
    }
  }

  /* ============================ SPAWNING (creatures) ======================= */
  const ACTIVE_R = 1300, DESPAWN_R = 2100;
  function randomPosNear(shark, minR, maxR) {
    const a = rand(0, TAU), r = rand(minR, maxR);
    return { x: clamp(shark.x + Math.cos(a) * r, 40, WORLD.w - 40), y: clamp(shark.y + Math.sin(a) * r, 40, WORLD.h - 40) };
  }
  function weightedTierPick(tiers) {
    // favor earlier (smaller) tiers within the zone's allowed set
    const weights = tiers.map((t, i) => tiers.length - i);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < tiers.length; i++) { r -= weights[i]; if (r <= 0) return tiers[i]; }
    return tiers[0];
  }
  function makeCreature(def, x, y) {
    return {
      def, x, y, vx: rand(-20, 20), vy: rand(-20, 20), angle: rand(0, TAU), facing: 1,
      wagPhase: rand(0, TAU), state: 'wander', stateTimer: rand(0.5, 2), homeX: x, homeY: y,
      hideTimer: rand(1, 3), schoolId: null, hitFlash: 0
    };
  }
  function spawnSchool(zone) {
    const smallTiers = zone.tiers.filter(t => t <= 1);
    if (!smallTiers.length) return;
    const tier = weightedTierPick(smallTiers);
    const options = CREATURES_BY_TIER[tier].filter(c => c.behavior === 'school');
    const def = options.length ? pick(options) : pick(CREATURES_BY_TIER[tier]);
    const pos = randomPosNear(Run.shark, 500, ACTIVE_R);
    const id = 'sc' + Math.random().toString(36).slice(2, 8);
    const school = { id, cx: pos.x, cy: pos.y, dirT: rand(0, TAU), timer: rand(1, 3), zoneId: zone.id };
    Run.schools.push(school);
    const n = randInt(5, 9);
    for (let i = 0; i < n; i++) {
      const c = makeCreature(def, pos.x + rand(-40, 40), pos.y + rand(-40, 40));
      c.schoolId = id;
      Run.creatures.push(c);
    }
  }
  function spawnLoneCreature(zone) {
    const tier = weightedTierPick(zone.tiers);
    const pool = CREATURES_BY_TIER[tier];
    if (!pool.length) return;
    const def = pick(pool);
    const pos = randomPosNear(Run.shark, 450, ACTIVE_R);
    Run.creatures.push(makeCreature(def, pos.x, pos.y));
  }
  function spawnTreasure() {
    const zone = zoneAtX(Run.shark.x);
    const kinds = [
      { type: 'coin', coin: [4, 9], xp: 0, r: 10 },
      { type: 'pearl', coin: [8, 14], xp: 2, r: 9 },
      { type: 'chest', coin: [18, 32], xp: 6, r: 15 },
      { type: 'artifact', coin: [26, 44], xp: 10, r: 14 }
    ];
    const k = pick(kinds);
    const pos = randomPosNear(Run.shark, 500, ACTIVE_R);
    Run.treasures.push({ kind: k.type, x: pos.x, y: pos.y, r: k.r, coin: randInt(k.coin[0], k.coin[1]), xp: k.xp, bob: rand(0, TAU), zoneId: zone.id });
  }
  function manageSpawns(dt) {
    const shark = Run.shark;
    const zone = zoneAtX(shark.x);
    // despawn far entities
    Run.creatures = Run.creatures.filter(c => distance(c.x, c.y, shark.x, shark.y) < DESPAWN_R);
    Run.treasures = Run.treasures.filter(t => distance(t.x, t.y, shark.x, shark.y) < DESPAWN_R);
    Run.schools = Run.schools.filter(s => Run.creatures.some(c => c.schoolId === s.id));

    const targetSchools = 3, targetLone = 26, targetTreasure = 5;
    if (Run.schools.length < targetSchools && Math.random() < 0.06) spawnSchool(zone);
    const loneCount = Run.creatures.filter(c => !c.schoolId).length;
    if (loneCount < targetLone && Math.random() < 0.35) spawnLoneCreature(zone);
    if (Run.treasures.length < targetTreasure && Math.random() < 0.05) spawnTreasure();
  }

  /* =============================== AI ===================================== */
  const FLEE_R = 160, AGGRO_R = 270;
  function isEdible(def) { return def.tier <= maxEatTier(); }

  function steerToward(c, tx, ty, speed, dt, turnRate) {
    const desired = Math.atan2(ty - c.y, tx - c.x);
    c.angle = angleLerp(c.angle, desired, clamp(turnRate * dt, 0, 1));
    c.vx = approach(c.vx, Math.cos(c.angle) * speed, 5, dt);
    c.vy = approach(c.vy, Math.sin(c.angle) * speed, 5, dt);
  }

  function updateCreatureAI(c, dt) {
    const shark = Run.shark;
    const def = c.def;
    const dToShark = distance(c.x, c.y, shark.x, shark.y);
    const edible = isEdible(def);
    c.hitFlash = Math.max(0, c.hitFlash - dt);

    if (edible && dToShark < FLEE_R) {
      // flee, with a little jitter so some wander back in
      let a = Math.atan2(c.y - shark.y, c.x - shark.x);
      if (Math.random() < 0.008) a += rand(-1.2, 1.2);
      const speed = def.speed * 1.35;
      c.angle = angleLerp(c.angle, a, clamp(def.turn * dt * 1.4, 0, 1));
      c.vx = approach(c.vx, Math.cos(c.angle) * speed, 6, dt);
      c.vy = approach(c.vy, Math.sin(c.angle) * speed, 6, dt);
      c.state = 'flee';
    } else if (!edible && def.dangerous && dToShark < AGGRO_R) {
      steerToward(c, shark.x, shark.y, def.speed * 1.5, dt, def.turn * 1.6);
      c.state = 'attack';
    } else {
      // passive behaviors
      c.stateTimer -= dt;
      if (def.behavior === 'school' && c.schoolId) {
        const school = Run.schools.find(s => s.id === c.schoolId);
        if (school) {
          const tx = school.cx + Math.cos(c.wagPhase) * 26, ty = school.cy + Math.sin(c.wagPhase * 0.7) * 26;
          steerToward(c, tx, ty, def.speed, dt, def.turn);
        }
      } else if (def.behavior === 'hide') {
        if (c.stateTimer <= 0) {
          c.state = c.state === 'hidden' ? 'move' : 'hidden';
          c.stateTimer = rand(1.5, 3.5);
          if (c.state === 'move') { c.homeX = c.x + rand(-60, 60); c.homeY = c.y + rand(-40, 40); }
        }
        if (c.state === 'move') steerToward(c, c.homeX, c.homeY, def.speed, dt, def.turn);
        else { c.vx *= (1 - 4 * dt); c.vy *= (1 - 4 * dt); }
      } else if (def.behavior === 'drift') {
        c.angle += Math.sin(c.wagPhase) * 0.4 * dt;
        c.vx = approach(c.vx, Math.cos(c.angle) * def.speed * 0.6, 1.5, dt);
        c.vy = approach(c.vy, Math.sin(c.angle) * def.speed * 0.6 + Math.sin(c.wagPhase * 0.5) * 10, 1.5, dt);
      } else if (def.behavior === 'ambush') {
        if (c.stateTimer <= 0) { c.stateTimer = rand(2, 4); c.vx *= 0.3; c.vy *= 0.3; }
      } else { // wander / glide / predator(when not aggroed)
        if (c.stateTimer <= 0) { c.stateTimer = rand(2, 4.5); c.angle += rand(-1.4, 1.4); }
        const spd = def.behavior === 'glide' ? def.speed : def.speed * 0.75;
        c.vx = approach(c.vx, Math.cos(c.angle) * spd, 2, dt);
        c.vy = approach(c.vy, Math.sin(c.angle) * spd, 2, dt);
      }
      if (c.state === 'flee' || c.state === 'attack') c.state = 'wander';
    }

    c.x += c.vx * dt; c.y += c.vy * dt;
    c.x = clamp(c.x, 20, WORLD.w - 20); c.y = clamp(c.y, 20, WORLD.h - 20);
    if (Math.hypot(c.vx, c.vy) > 4) c.facing = c.vx < -3 ? -1 : (c.vx > 3 ? 1 : c.facing);
    c.wagPhase += dt * (4 + Math.hypot(c.vx, c.vy) * 0.03);
  }

  function updateSchools(dt) {
    for (const s of Run.schools) {
      s.timer -= dt;
      if (s.timer <= 0) { s.timer = rand(2, 4); s.dirT += rand(-1, 1); }
      const zone = ZONES[s.zoneId] || ZONES[0];
      s.cx += Math.cos(s.dirT) * 14 * dt;
      s.cy += Math.sin(s.dirT) * 14 * dt;
      s.cx = clamp(s.cx, zone.x0 + 60, zone.x1 - 60);
      s.cy = clamp(s.cy, WORLD.h * 0.15, WORLD.h * 0.85);
    }
  }

  /* ============================ SHARK PHYSICS ============================= */
  function updateShark(dt) {
    const s = Run.shark;
    if (s.dead) {
      s.deathTimer -= dt;
      s.vx *= (1 - 1.5 * dt); s.vy += 30 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.angle += dt * 5;
      if (s.deathTimer <= 0) finishGameOver();
      return;
    }
    const hungerLow = s.hunger < s.maxHunger * 0.2;
    s.boosting = Input.boosting && s.boostMeter > 2;
    const speedMult = (s.boosting ? 1.85 : 1) * (hungerLow ? 0.72 : 1);
    const maxSpeed = currentSpeed() * speedMult;

    const inMag = Math.hypot(Input.moveX, Input.moveY);
    let tvx = 0, tvy = 0;
    if (inMag > 0.01) { tvx = Input.moveX * maxSpeed; tvy = Input.moveY * maxSpeed; }

    const accelRate = inMag > 0.01 ? 6.2 : 3.0;
    s.vx = approach(s.vx, tvx + s.lungeVX, accelRate, dt);
    s.vy = approach(s.vy, tvy + s.lungeVY, accelRate, dt);
    s.lungeVX = approach(s.lungeVX, 0, 4, dt);
    s.lungeVY = approach(s.lungeVY, 0, 4, dt);

    const speed = Math.hypot(s.vx, s.vy);
    if (speed > 8) {
      const targetAngle = Math.atan2(s.vy, s.vx);
      s.angle = angleLerp(s.angle, targetAngle, clamp(5 * dt, 0, 1));
      if (s.vx < -6) s.facing = -1; else if (s.vx > 6) s.facing = 1;
    }
    s.tilt = clamp(s.vy / maxSpeed, -0.5, 0.5) * 0.35;

    s.x += s.vx * dt; s.y += s.vy * dt;
    s.x = clamp(s.x, 24, WORLD.w - 24); s.y = clamp(s.y, 24, WORLD.h - 24);

    // scale tween (growth)
    s.scaleTarget = LEVELS[Save.level - 1].scale;
    s.scaleCur = approach(s.scaleCur, s.scaleTarget, 2.2, dt);
    s.r = SHARK_BASE_R * s.scaleCur;

    // hunger
    const hungerDrainRate = (100 / 75) * (1 - 0.12 * Save.upgrades.hunger);
    s.hunger = clamp(s.hunger - hungerDrainRate * dt, 0, s.maxHunger);
    if (s.hunger <= 0) s.health = clamp(s.health - 3 * dt, 0, s.maxHealth);

    // boost meter
    if (s.boosting) {
      s.boostMeter = clamp(s.boostMeter - 42 * dt, 0, s.maxBoost);
      if (Math.random() < 12 * dt) bubbleAt(s.x - Math.cos(s.angle) * s.r, s.y - Math.sin(s.angle) * s.r, 1);
    } else {
      s.boostMeter = clamp(s.boostMeter + 20 * dt, 0, s.maxBoost);
    }

    s.wagPhase += dt * (5 + speed * 0.03);
    s.mouthOpen = approach(s.mouthOpen, s.biteTimer > 0 ? 1 : 0, 14, dt);
    if (s.biteTimer > 0) s.biteTimer -= dt;
    s.invuln = Math.max(0, s.invuln - dt);
    s.damageFlash = Math.max(0, s.damageFlash - dt);

    if (s.health <= 0 && !s.dead) killShark();
  }

  function killShark() {
    const s = Run.shark;
    s.dead = true; s.deathTimer = 0.9;
    Run.shake = 0.5;
    AudioSys.deathSting();
    haptic(60);
  }

  /* ======================== COMBO / XP / COINS ============================ */
  const COMBO_WINDOW = 2.6;
  function comboMultiplier() {
    const c = Run.comboCount;
    if (c >= 20) return 2.2;
    if (c >= 10) return 1.7;
    if (c >= 5) return 1.35;
    return 1;
  }
  function addXP(amount) {
    Run.xpEarnedRun += amount;
    Save.xp += amount;
    let leveled = false;
    while (Save.level < LEVELS.length && Save.xp >= LEVELS[Save.level - 1].xpToNext) {
      Save.xp -= LEVELS[Save.level - 1].xpToNext;
      Save.level++;
      leveled = true;
    }
    if (leveled) triggerLevelUp();
  }
  function addCoins(amount) {
    const withMult = Math.round(amount * (1 + 0.12 * Save.upgrades.coinMult));
    Save.coins += withMult;
    Run.coinsEarnedRun += withMult;
  }
  function triggerLevelUp() {
    const s = Run.shark;
    s.maxHealth = 100 + 20 * Save.upgrades.health;
    s.health = s.maxHealth;
    s.maxHunger = 100 * (1 + 0.2 * Save.upgrades.hunger);
    const el = $('levelUpOverlay');
    $('levelNum').textContent = Save.level;
    $('levelUpTitle').textContent = LEVELS[Save.level - 1].title;
    el.classList.remove('hidden'); void el.offsetWidth;
    AudioSys.levelUp(); haptic([30, 40, 30, 60]);
    burst(cssW / 2, cssH * 0.32, '#ffe08a', '#ffc24b', 26, 220);
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 1500);
    persistSave();
  }

  function showComboBanner(count) {
    const wrap = $('comboWrap');
    const div = document.createElement('div');
    div.className = 'comboBanner' + (count >= 10 ? ' frenzy' : '');
    div.textContent = count >= 10 ? `FEEDING FRENZY x${count}!` : `COMBO x${count}`;
    wrap.innerHTML = '';
    wrap.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 720);
  }

  function eatCreature(idx) {
    const c = Run.creatures[idx];
    const def = c.def;
    const s = Run.shark;
    Run.comboCount++;
    Run.comboTimer = COMBO_WINDOW;
    Run.bestComboRun = Math.max(Run.bestComboRun, Run.comboCount);
    if (Run.comboCount > Save.bestCombo) Save.bestCombo = Run.comboCount;
    const mult = comboMultiplier();
    const biteBonus = 1 + 0.10 * Save.upgrades.bite;
    const xpGain = Math.max(1, Math.round(def.xp * mult * biteBonus));
    const coinGain = Math.max(1, Math.round(def.coin * mult * biteBonus));
    addXP(xpGain); addCoins(coinGain);
    s.hunger = clamp(s.hunger + 6 + def.tier * 5, 0, s.maxHunger);

    const dx = c.x - s.x, dy = c.y - s.y, dm = Math.hypot(dx, dy) || 1;
    s.lungeVX = (dx / dm) * 90; s.lungeVY = (dy / dm) * 90;
    s.biteTimer = 0.16;

    burst(c.x, c.y, def.colA, def.colB, 10 + Math.min(Run.comboCount, 12), 70 + mult * 40);
    floatText(c.x, c.y - 10, `+${xpGain}xp +${coinGain}c`, '#ffe08a');
    Run.shake = Math.min(0.9, Run.shake + 0.08 + def.tier * 0.03);
    AudioSys.bite(Run.comboCount);
    haptic(12);

    Run.creatures.splice(idx, 1);

    updateMissionsProgress('eatTier', { tier: def.tier });
    if (def.dangerous) updateMissionsProgress('eatDangerous', {});

    if ([2, 3, 5, 10, 15, 20].includes(Run.comboCount)) {
      showComboBanner(Run.comboCount);
      AudioSys.comboUp();
      updateMissionsProgress('combo', { combo: Run.comboCount });
    } else {
      updateMissionsProgress('combo', { combo: Run.comboCount });
    }
  }

  function bounceOff(c) {
    const s = Run.shark;
    const dx = s.x - c.x, dy = s.y - c.y, dm = Math.hypot(dx, dy) || 1;
    s.vx += (dx / dm) * 40; s.vy += (dy / dm) * 40;
  }

  function damageShark(amount, fromX, fromY) {
    const s = Run.shark;
    if (s.invuln > 0 || s.dead) return;
    s.health = clamp(s.health - amount, 0, s.maxHealth);
    s.invuln = 1.1; s.damageFlash = 0.4;
    const dx = s.x - fromX, dy = s.y - fromY, dm = Math.hypot(dx, dy) || 1;
    s.lungeVX = (dx / dm) * 220; s.lungeVY = (dy / dm) * 220;
    Run.shake = Math.min(1, Run.shake + 0.35);
    AudioSys.damage(); haptic(45);
    burst(s.x, s.y, '#ff5a63', '#ffb199', 14, 120);
  }

  function checkCollisions(dt) {
    const s = Run.shark;
    if (s.dead) return;
    for (let i = Run.creatures.length - 1; i >= 0; i--) {
      const c = Run.creatures[i];
      const eatPad = s.r * 0.55 + 16;
      const d = distance(s.x, s.y, c.x, c.y);
      const edible = isEdible(c.def);
      if (edible) {
        if (d < s.r * 0.9 + c.def.r * 0.5 + eatPad) { eatCreature(i); }
      } else {
        if (d < s.r * 0.85 + c.def.r * 0.85) {
          if (c.def.dangerous) damageShark(c.def.dmg, c.x, c.y);
          else bounceOff(c);
        } else if (c.def.dangerous && d < 90) {
          ringWarn(c.x, c.y, '#ff5a63', 0.4);
        }
      }
    }
    for (let i = Run.treasures.length - 1; i >= 0; i--) {
      const t = Run.treasures[i];
      if (distance(s.x, s.y, t.x, t.y) < s.r * 0.8 + t.r + 14) {
        addCoins(t.coin); if (t.xp) addXP(t.xp);
        sparkleAt(t.x, t.y);
        floatText(t.x, t.y - 10, `+${t.coin}c`, '#ffdf8a');
        AudioSys.coinPickup();
        updateMissionsProgress('treasure', {});
        Run.treasures.splice(i, 1);
      }
    }
  }

  /* ================================ BOSS =================================== */
  const BOSS_DEF = { name: 'THE ABYSS WARDEN', r: 105, maxHealth: 420, dmg: 26 };
  function maybeTriggerBoss() {
    const abyss = ZONES[3];
    if (Run.shark.x > abyss.x0 + 500 && Run.bossState === 'none' && Run.bossCooldown <= 0) {
      Run.bossState = 'warning';
      const bw = $('bossWarning');
      bw.classList.remove('hidden'); void bw.offsetWidth;
      AudioSys.bossWarn(); haptic([40, 60, 40]);
      setTimeout(() => {
        if (Run.bossState !== 'warning') return;
        spawnBoss();
      }, 2200);
    }
  }
  function spawnBoss() {
    const s = Run.shark;
    Run.boss = {
      x: s.x + 500, y: s.y, vx: 0, vy: 0, angle: Math.PI,
      health: BOSS_DEF.maxHealth, maxHealth: BOSS_DEF.maxHealth,
      mode: 'chase', modeTimer: 1.2, hitCd: 0, wagPhase: 0, facing: -1
    };
    Run.bossState = 'active';
    $('bossBarWrap').classList.remove('hidden');
  }
  function updateBoss(dt) {
    const b = Run.boss, s = Run.shark;
    if (!b) return;
    b.wagPhase += dt * 4;
    b.hitCd = Math.max(0, b.hitCd - dt);
    b.modeTimer -= dt;
    const d = distance(b.x, b.y, s.x, s.y);
    const phase2 = b.health < b.maxHealth * 0.5;

    if (b.mode === 'chase') {
      steerToward(b, s.x, s.y, 60, dt, 1.2);
      if (d < 480 && b.modeTimer <= 0) {
        b.mode = phase2 && Math.random() < 0.4 ? 'spin_telegraph' : 'telegraph';
        b.modeTimer = phase2 ? 0.55 : 0.85;
        b.tx = s.x; b.ty = s.y;
        ringWarn(b.x, b.y, '#ff5a63', b.modeTimer);
      }
    } else if (b.mode === 'telegraph') {
      b.vx *= (1 - 4 * dt); b.vy *= (1 - 4 * dt);
      if (b.modeTimer <= 0) { b.mode = 'charging'; b.modeTimer = 0.7; const a = Math.atan2(b.ty - b.y, b.tx - b.x); b.vx = Math.cos(a) * 430; b.vy = Math.sin(a) * 430; b.angle = a; }
    } else if (b.mode === 'charging') {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= (1 - 0.6 * dt); b.vy *= (1 - 0.6 * dt);
      if (d < b.r * 0.7 + s.r * 0.7) damageShark(BOSS_DEF.dmg, b.x, b.y);
      if (b.modeTimer <= 0) { b.mode = 'recover'; b.modeTimer = 1.1; }
    } else if (b.mode === 'spin_telegraph') {
      if (b.modeTimer <= 0) { b.mode = 'spinning'; b.modeTimer = 0.9; }
    } else if (b.mode === 'spinning') {
      b.angle += dt * 10;
      if (d < 190) damageShark(BOSS_DEF.dmg * 0.6 * dt, b.x, b.y);
      if (b.modeTimer <= 0) { b.mode = 'recover'; b.modeTimer = 1.0; }
    } else if (b.mode === 'recover') {
      b.vx *= (1 - 3 * dt); b.vy *= (1 - 3 * dt);
      if (b.modeTimer <= 0) { b.mode = 'chase'; b.modeTimer = phase2 ? 0.6 : 1.2; }
      if (d < b.r * 0.85 + s.r * 0.85 + 20 && b.hitCd <= 0) {
        b.health -= 42 * (1 + 0.1 * Save.upgrades.bite);
        b.hitCd = 0.3;
        burst(b.x, b.y, '#ff9a4d', '#ff5a63', 14, 100);
        AudioSys.bossHit(); haptic(20);
        Run.shake = Math.min(0.8, Run.shake + 0.2);
        if (b.health <= 0) return defeatBoss();
      }
    }
    b.x = clamp(b.x, 60, WORLD.w - 60); b.y = clamp(b.y, 60, WORLD.h - 60);
    if (Math.abs(b.vx) > 5) b.facing = b.vx < 0 ? -1 : 1;
    $('bossFill').style.width = clamp(b.health / b.maxHealth, 0, 1) * 100 + '%';
  }
  function defeatBoss() {
    burst(Run.boss.x, Run.boss.y, '#ffe08a', '#ff9a4d', 60, 260);
    Run.shake = 1;
    AudioSys.bossDefeatSnd(); haptic([30, 50, 30, 50, 80]);
    addXP(260); addCoins(220);
    updateMissionsProgress('eatDangerous', {});
    toast('The Abyss Warden is defeated!');
    Run.boss = null; Run.bossState = 'defeated'; Run.bossCooldown = 45;
    $('bossBarWrap').classList.add('hidden');
  }

  /* ============================== MISSIONS ================================= */
  function currentMission() { return MISSIONS.find(m => !Save.missionsDone[m.id]); }
  function updateMissionsProgress(type, payload) {
    for (const m of MISSIONS) {
      if (Save.missionsDone[m.id] || m.type !== type) continue;
      let inc = 0;
      if (type === 'eatTier' && m.tiers.includes(payload.tier)) inc = 1;
      else if (type === 'zone' && payload.zone === m.zone) inc = 1;
      else if (type === 'combo') { Save.missions[m.id] = Math.max(Save.missions[m.id] || 0, Math.min(payload.combo, m.target)); }
      else if (type === 'treasure') inc = 1;
      else if (type === 'eatDangerous') inc = 1;
      else if (type === 'survive') { Save.missions[m.id] = Math.min(payload.t, m.target); }
      if (inc) Save.missions[m.id] = clamp((Save.missions[m.id] || 0) + inc, 0, m.target);
      const prog = Save.missions[m.id] || 0;
      if (prog >= m.target && !Save.missionsDone[m.id]) completeMission(m);
    }
  }
  function completeMission(m) {
    Save.missionsDone[m.id] = true;
    addXP(m.xp); addCoins(m.coin);
    toast(`Mission complete: ${m.text}`);
    AudioSys.missionDone();
    persistSave();
    renderMissionsList();
  }

  /* ================================ TOASTS ================================= */
  function toast(msg) {
    const c = $('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2900);
  }

  /* ================================ ZONES =================================== */
  function updateZoneTracking() {
    const z = zoneAtX(Run.shark.x);
    Run.zoneIndex = z.id;
    if (z.id !== Run.lastZoneIndex) {
      Run.lastZoneIndex = z.id;
      if (!Save.zonesUnlocked.includes(z.id)) {
        Save.zonesUnlocked.push(z.id);
        persistSave();
      }
      $('zoneBannerName').textContent = z.name;
      const zb = $('zoneBanner'); zb.classList.remove('hidden'); void zb.offsetWidth;
      clearTimeout(zb._t); zb._t = setTimeout(() => zb.classList.add('hidden'), 2500);
      updateMissionsProgress('zone', { zone: z.id });
    }
  }

  /* ================================ CAMERA ================================= */
  function updateCamera(dt) {
    const s = Run.shark;
    Run.camera.x = approach(Run.camera.x, s.x, 4, dt);
    Run.camera.y = approach(Run.camera.y, s.y, 4, dt);
    Run.camera.x = clamp(Run.camera.x, cssW / 2, WORLD.w - cssW / 2);
    Run.camera.y = clamp(Run.camera.y, cssH / 2, WORLD.h - cssH / 2);
    Run.shake = Math.max(0, Run.shake - dt * 2.4);
  }

  /* ================================ RENDER ================================= */
  function worldToScreen(x, y, parallax) {
    parallax = parallax == null ? 1 : parallax;
    return {
      x: (x - Run.camera.x) * parallax + cssW / 2,
      y: (y - Run.camera.y) * parallax + cssH / 2
    };
  }

  function drawBackground() {
    const zone = zoneAtX(Run.camera.x);
    let nextZone = ZONES[Math.min(zone.id + 1, ZONES.length - 1)];
    const blendDist = 400;
    let t = 0;
    if (zone.id < ZONES.length - 1) t = clamp((Run.camera.x - (zone.x1 - blendDist)) / blendDist, 0, 1);
    function mixHex(h1, h2, t) {
      const c1 = parseInt(h1.slice(1), 16), c2 = parseInt(h2.slice(1), 16);
      const r = Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t));
      const g = Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t));
      const b = Math.round(lerp(c1 & 255, c2 & 255, t));
      return `rgb(${r},${g},${b})`;
    }
    const top = mixHex(zone.sky[0], nextZone.sky[0], t);
    const bot = mixHex(zone.sky[1], nextZone.sky[1], t);
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cssW, cssH);

    // light rays (shallow zones only)
    if (Run.camera.y < WORLD.h * 0.55) {
      ctx.save();
      ctx.globalAlpha = 0.10 * (1 - Run.camera.y / (WORLD.h * 0.6));
      for (let i = 0; i < 5; i++) {
        const rx = ((Run.camera.x * 0.15 + i * 260) % (cssW + 400)) - 200;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(rx, -20);
        ctx.lineTo(rx + 70, -20);
        ctx.lineTo(rx - 40, cssH * 0.8);
        ctx.lineTo(rx - 110, cssH * 0.8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawDecorItem(d) {
    const p = worldToScreen(d.x, d.y, d.layer);
    if (p.x < -80 || p.x > cssW + 80 || p.y < -80 || p.y > cssH + 80) return;
    const s = d.size * (0.6 + d.layer * 0.6);
    ctx.save();
    ctx.globalAlpha = 0.45 + d.layer * 0.5;
    ctx.translate(p.x, p.y);
    const shade = d.layer > 0.6 ? '#0e3352' : '#06202f';
    if (d.type === 'coral') {
      ctx.fillStyle = d.layer > 0.6 ? '#ff8a6a' : '#7a4638';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 8 * s - 12 * s, -i * 6 * s, 7 * s, 16 * s, 0, 0, TAU);
        ctx.fill();
      }
    } else if (d.type === 'seaweed') {
      ctx.strokeStyle = d.layer > 0.6 ? '#2fae6a' : '#134a2e';
      ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 10 * s, 0);
        ctx.quadraticCurveTo(i * 10 * s + Math.sin(d.seed) * 14 * s, -30 * s, i * 10 * s + Math.sin(d.seed + 1) * 10 * s, -60 * s);
        ctx.stroke();
      }
    } else if (d.type === 'rock') {
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(-24 * s, 0); ctx.lineTo(-14 * s, -20 * s); ctx.lineTo(10 * s, -26 * s); ctx.lineTo(26 * s, -6 * s); ctx.lineTo(20 * s, 4 * s); ctx.closePath();
      ctx.fill();
    } else if (d.type === 'cave') {
      ctx.fillStyle = '#020608';
      ctx.beginPath(); ctx.ellipse(0, -10 * s, 34 * s, 24 * s, 0, 0, TAU); ctx.fill();
    } else if (d.type === 'wreck') {
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(-30 * s, -18 * s, 60 * s, 14 * s);
      ctx.beginPath(); ctx.moveTo(-30 * s, -18 * s); ctx.lineTo(-10 * s, -46 * s); ctx.lineTo(10 * s, -18 * s); ctx.closePath(); ctx.fill();
    } else if (d.type === 'shell') {
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath(); ctx.ellipse(0, 0, 9 * s, 6 * s, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawTreasure(t) {
    const p = worldToScreen(t.x, t.y);
    if (p.x < -40 || p.x > cssW + 40 || p.y < -40 || p.y > cssH + 40) return;
    const bob = Math.sin(Run.time * 2 + t.bob) * 5;
    ctx.save(); ctx.translate(p.x, p.y + bob);
    ctx.shadowColor = 'rgba(255,223,138,.8)'; ctx.shadowBlur = 12;
    if (t.kind === 'coin') { ctx.fillStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(0, 0, t.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#c98f22'; ctx.font = `${t.r}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1); }
    else if (t.kind === 'pearl') { ctx.fillStyle = '#f2f5ff'; ctx.beginPath(); ctx.arc(0, 0, t.r, 0, TAU); ctx.fill(); }
    else if (t.kind === 'chest') { ctx.fillStyle = '#a5672c'; ctx.fillRect(-t.r, -t.r * 0.7, t.r * 2, t.r * 1.4); ctx.fillStyle = '#ffd75e'; ctx.fillRect(-t.r, -2, t.r * 2, 4); }
    else { ctx.fillStyle = '#c9a2ff'; ctx.beginPath(); ctx.moveTo(0, -t.r); ctx.lineTo(t.r, 0); ctx.lineTo(0, t.r); ctx.lineTo(-t.r, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function drawCustomPngFish(c, def, scale) {
    const img = def._image;
    if (!img || !img.complete || !img.naturalWidth) return false;
    const r = def.r * scale;
    const w = def.pngWidth || r * 2.8;
    const h = def.pngHeight || r * 2;
    ctx.save();
    ctx.scale(c.facing, 1);
    ctx.globalAlpha = def.pngAlpha == null ? 1 : def.pngAlpha;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawFishLike(c, def, scale) {
    const r = def.r * scale;
    ctx.save();
    ctx.scale(c.facing, 1);
    const wag = Math.sin(c.wagPhase) * 0.35;
    ctx.fillStyle = def.colB;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.lineTo(-r * 1.7, -r * 0.6 + wag * r);
    ctx.lineTo(-r * 1.7, r * 0.6 + wag * r);
    ctx.closePath(); ctx.fill();
    const grd = ctx.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, def.colA); grd.addColorStop(1, def.colB);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.68, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = def.colB;
    ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.6); ctx.lineTo(r * 0.15, -r * 1.05); ctx.lineTo(r * 0.35, -r * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a1520';
    ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.08, r * 0.13, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawCrab(c, def, scale) {
    const r = def.r * scale;
    ctx.save(); ctx.scale(c.facing, 1);
    ctx.fillStyle = def.colA;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = def.colB; ctx.lineWidth = 2.4;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.28, r * 0.4); ctx.lineTo(i * r * 0.4, r * 0.85); ctx.stroke(); }
    ctx.fillStyle = def.colB;
    const pinch = 1 + Math.sin(c.wagPhase * 3) * 0.15;
    ctx.beginPath(); ctx.ellipse(-r * 1.15, -r * 0.15, r * 0.32 * pinch, r * 0.24, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 1.15, -r * 0.15, r * 0.32 * pinch, r * 0.24, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawJelly(c, def, scale) {
    const r = def.r * scale;
    ctx.save(); ctx.globalAlpha = 0.8;
    const g = ctx.createRadialGradient(0, -r * 0.2, r * 0.2, 0, 0, r);
    g.addColorStop(0, def.colA); g.addColorStop(1, def.colB);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.85, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = def.colB; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.28, -r * 0.05);
      ctx.quadraticCurveTo(i * r * 0.28 + Math.sin(c.wagPhase + i) * 5, r * 0.7, i * r * 0.28 + Math.sin(c.wagPhase + i) * 3, r * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSquid(c, def, scale) {
    const r = def.r * scale;
    ctx.save(); ctx.scale(c.facing, 1);
    ctx.fillStyle = def.colA;
    ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.6, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = def.colB; ctx.lineWidth = 2.4;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.18, r * 0.5);
      ctx.quadraticCurveTo(i * r * 0.2 + Math.sin(c.wagPhase + i) * 6, r * 1.1, i * r * 0.24 + Math.sin(c.wagPhase * 1.3 + i) * 4, r * 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = '#0a1520'; ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.25, r * 0.1, 0, TAU); ctx.arc(r * 0.18, -r * 0.25, r * 0.1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawRay(c, def, scale) {
    const r = def.r * scale;
    ctx.save(); ctx.scale(c.facing, 1);
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, def.colA); g.addColorStop(1, def.colB);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.95 + Math.sin(c.wagPhase) * r * 0.15, -r * 1.1, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.4, 0, -r * 1.1, r * 0.2);
    ctx.quadraticCurveTo(r * 0.2, r * 0.95 - Math.sin(c.wagPhase) * r * 0.15, r * 1.2, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = def.colB; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.quadraticCurveTo(-r * 1.6, r * 0.3, -r * 2.1, r * 0.1); ctx.stroke();
    ctx.restore();
  }
  function drawEel(c, def, scale) {
    const r = def.r * scale;
    ctx.save(); ctx.scale(c.facing, 1);
    ctx.strokeStyle = def.colA; ctx.lineWidth = r * 0.55; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 1.4, 0);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      ctx.lineTo(r * 1.4 - t * r * 2.8, Math.sin(c.wagPhase - t * 5) * r * 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = def.colB; ctx.beginPath(); ctx.arc(r * 1.4, 0, r * 0.32, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawPredatorBody(x, y, angle, facing, r, colA, colB, wagPhase, mouthOpen, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((tilt || 0));
    ctx.scale(facing, 1);
    const wag = Math.sin(wagPhase) * 0.22;
    // tail
    ctx.fillStyle = colB;
    ctx.beginPath();
    ctx.moveTo(-r * 1.0, 0);
    ctx.quadraticCurveTo(-r * 1.5, -r * 0.75 + wag * r * 1.2, -r * 2.1, -r * 0.15 + wag * r * 1.6);
    ctx.quadraticCurveTo(-r * 1.55, 0, -r * 2.1, r * 0.15 + wag * r * 1.6);
    ctx.quadraticCurveTo(-r * 1.5, r * 0.75 + wag * r * 1.2, -r * 1.0, 0);
    ctx.fill();
    // dorsal fin
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.55);
    ctx.lineTo(r * 0.15, -r * 1.25);
    ctx.lineTo(r * 0.45, -r * 0.5);
    ctx.closePath(); ctx.fill();
    // pectoral fin
    ctx.beginPath();
    ctx.moveTo(r * 0.05, r * 0.25);
    ctx.lineTo(r * 0.45, r * 0.85);
    ctx.lineTo(r * 0.55, r * 0.25);
    ctx.closePath(); ctx.fill();
    // body
    const grd = ctx.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, colA); grd.addColorStop(1, colB);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.quadraticCurveTo(r * 1.0, -r * 0.72, r * 0.1, -r * 0.62);
    ctx.quadraticCurveTo(-r * 0.8, -r * 0.55, -r * 1.05, 0);
    ctx.quadraticCurveTo(-r * 0.8, r * 0.55, r * 0.1, r * 0.62);
    ctx.quadraticCurveTo(r * 1.0, r * 0.72, r * 1.35, 0);
    ctx.closePath(); ctx.fill();
    // belly highlight
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(r * 0.1, r * 0.28, r * 0.65, r * 0.22, 0.15, 0, TAU);
    ctx.fill();
    // mouth
    if (mouthOpen > 0.02) {
      ctx.fillStyle = '#3a0a10';
      ctx.beginPath();
      ctx.moveTo(r * 1.32, r * 0.06);
      ctx.quadraticCurveTo(r * 1.05, r * (0.06 + mouthOpen * 0.55), r * 0.78, r * 0.1);
      ctx.quadraticCurveTo(r * 1.05, r * 0.16, r * 1.32, r * 0.06);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(r * (1.28 - i * 0.13), r * (0.07 + mouthOpen * 0.1));
        ctx.lineTo(r * (1.24 - i * 0.13), r * (0.07 + mouthOpen * 0.32));
        ctx.lineTo(r * (1.20 - i * 0.13), r * (0.07 + mouthOpen * 0.1));
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.strokeStyle = colB; ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath(); ctx.moveTo(r * 1.32, r * 0.08); ctx.quadraticCurveTo(r * 1.1, r * 0.16, r * 0.95, r * 0.08); ctx.stroke();
    }
    // eye
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(r * 0.78, -r * 0.18, r * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(r * 0.8, -r * 0.21, r * 0.03, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCreature(c) {
    const p = worldToScreen(c.x, c.y);
    if (p.x < -100 || p.x > cssW + 100 || p.y < -100 || p.y > cssH + 100) return;
    const def = c.def;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (c.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(Run.time * 40) * 0.2;
    const edible = isEdible(def);
    if (!edible && def.dangerous) {
      const pulse = 0.5 + Math.sin(Run.time * 5) * 0.5;
      ctx.save(); ctx.globalAlpha = 0.18 + pulse * 0.12;
      ctx.strokeStyle = '#ff5a63'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, def.r + 10 + pulse * 4, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (def.png && drawCustomPngFish(c, def, 1)) { ctx.restore(); return; }
    switch (def.body) {
      case 'fish': drawFishLike(c, def, 1); break;
      case 'crab': drawCrab(c, def, 1); break;
      case 'jelly': drawJelly(c, def, 1); break;
      case 'squid': drawSquid(c, def, 1); break;
      case 'shrimp': drawFishLike(c, def, 0.85); break;
      case 'ray': drawRay(c, def, 1); break;
      case 'eel': drawEel(c, def, 1); break;
      case 'predator':
        ctx.restore(); // predators use world-space draw (rotation), re-handle below
        drawPredatorBody(p.x, p.y, c.angle, c.facing, def.r, def.colA, def.colB, c.wagPhase, 0.15, 0);
        return;
      default: drawFishLike(c, def, 1);
    }
    ctx.restore();
  }

  function drawBoss() {
    const b = Run.boss;
    if (!b) return;
    const p = worldToScreen(b.x, b.y);
    if (b.mode === 'telegraph' || b.mode === 'spin_telegraph') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ff5a63'; ctx.lineWidth = 3;
      const rad = b.mode === 'spin_telegraph' ? 190 : 20 + (1 - Math.max(0, b.modeTimer)) * 40;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    const flash = b.hitCd > 0.15 ? 1 : 0;
    ctx.save();
    if (flash) ctx.globalAlpha = 0.7;
    drawPredatorBody(p.x, p.y, b.angle, b.facing, BOSS_DEF.r, '#3a1030', '#0a0410', b.wagPhase, b.mode === 'recover' ? 0.7 : 0.1, 0);
    ctx.restore();
  }

  function drawShark() {
    const s = Run.shark;
    const p = worldToScreen(s.x, s.y);
    ctx.save();
    if (s.damageFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(Run.time * 50) * 0.25;
    if (s.dead) ctx.globalAlpha = clamp(s.deathTimer / 0.9, 0, 1);
    const squash = s.biteTimer > 0 ? 1.08 : 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(s.dead ? s.angle : s.tilt * 0.5);
    ctx.scale(squash, 1 / squash);
    ctx.translate(-p.x, -p.y);
    drawPredatorBody(p.x, p.y, s.angle, s.facing, s.r, '#8fb8c9', '#274a5c', s.wagPhase, s.mouthOpen, 0);
    if (s.boosting) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#bff5ff';
      const bx = p.x - Math.cos(s.angle) * s.r * 1.4, by = p.y - Math.sin(s.angle) * s.r * 1.4;
      ctx.beginPath(); ctx.ellipse(bx, by, s.r * 0.9, s.r * 0.35, s.angle, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const pt of PARTS) {
      if (!pt.active) continue;
      const p = worldToScreen(pt.x, pt.y);
      const lifeT = pt.life / pt.maxLife;
      if (pt.type === 'burst') {
        ctx.save(); ctx.globalAlpha = clamp(lifeT, 0, 1); ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, pt.size * lifeT + 1, 0, TAU); ctx.fill(); ctx.restore();
      } else if (pt.type === 'bubble') {
        ctx.save(); ctx.globalAlpha = clamp(lifeT, 0, 1) * 0.6; ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, pt.size, 0, TAU); ctx.stroke(); ctx.restore();
      } else if (pt.type === 'text') {
        ctx.save(); ctx.globalAlpha = clamp(lifeT, 0, 1);
        ctx.fillStyle = pt.color; ctx.font = (pt.big ? 'bold 18px' : 'bold 13px') + ' -apple-system,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(pt.text, p.x, p.y);
        ctx.restore();
      } else if (pt.type === 'ring') {
        ctx.save(); ctx.globalAlpha = clamp(lifeT, 0, 1) * 0.6; ctx.strokeStyle = pt.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, pt.r0 + (1 - lifeT) * 40, 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    if (Run.shake > 0.001 && Save.settings.shake) {
      const m = Run.shake * 10;
      ctx.translate(rand(-m, m), rand(-m, m));
    }
    drawBackground();
    for (const d of DECOR) drawDecorItem(d);
    for (const t of Run.treasures) drawTreasure(t);
    const drawList = Run.creatures.slice().sort((a, b) => a.y - b.y);
    for (const c of drawList) drawCreature(c);
    drawBoss();
    drawShark();
    drawParticles();
    ctx.restore();
  }

  /* =============================== HUD SYNC ================================ */
  function syncHUD() {
    const s = Run.shark;
    $('levelNum').textContent = Save.level;
    const lvl = LEVELS[Save.level - 1];
    const xpPct = lvl.xpToNext === Infinity ? 100 : clamp(Save.xp / lvl.xpToNext, 0, 1) * 100;
    $('xpFill').style.width = xpPct + '%';
    $('xpZoneLabel').textContent = zoneAtX(s.x).name;
    const hungerPct = clamp(s.hunger / s.maxHunger, 0, 1) * 100;
    const hf = $('hungerFill'); hf.style.width = hungerPct + '%';
    hf.classList.toggle('low', hungerPct < 20);
    $('coinNum').textContent = Save.coins;
    const m = currentMission();
    if (m) {
      $('missionText').textContent = m.text;
      const prog = Save.missions[m.id] || 0;
      $('missionProgFill').style.width = clamp(prog / m.target, 0, 1) * 100 + '%';
    } else {
      $('missionText').textContent = 'All missions complete!';
      $('missionProgFill').style.width = '100%';
    }
    const ring = $('boostRing');
    ring.style.opacity = s.boosting ? 0.9 : 0;
  }

  /* ================================ SCREENS ================================ */
  const screens = ['bootScreen', 'mainMenu', 'sharkScreen', 'upgradesScreen', 'missionsScreen', 'settingsScreen', 'pauseMenu', 'gameOverScreen'];
  function hideAllScreens() { screens.forEach(id => $(id).classList.add('hidden')); }
  function openScreen(id, originId) {
    hideAllScreens();
    $(id).classList.remove('hidden');
    if (originId) Run.prevScreen = originId;
  }

  function renderSharkStats() {
    const s = Run.shark, lvl = LEVELS[Save.level - 1];
    $('sharkStatsList').innerHTML = `
      <div class="statRow"><span>Title</span><b>${lvl.title}</b></div>
      <div class="statRow"><span>Level</span><b>${Save.level} / 7</b></div>
      <div class="statRow"><span>Max Health</span><b>${100 + 20 * Save.upgrades.health}</b></div>
      <div class="statRow"><span>Swim Speed</span><b>${Math.round(currentSpeed())}</b></div>
      <div class="statRow"><span>Best Combo</span><b>x${Save.bestCombo}</b></div>
      <div class="statRow"><span>Coins</span><b>${Save.coins}</b></div>
    `;
    const pc = $('sharkPreviewCanvas'), pctx = pc.getContext('2d');
    pctx.clearRect(0, 0, pc.width, pc.height);
    pctx.save(); pctx.translate(pc.width / 2, pc.height / 2 + 10);
    const scale = Math.min(2.6, 70 / SHARK_BASE_R) * (lvl.scale / LEVELS[6].scale) * 1.6 + 0.5;
    drawPredatorBody(0, 0, 0, 1, 34 * lvl.scale * 0.55 + 18, '#8fb8c9', '#274a5c', performance.now() / 260, 0.25, 0);
    pctx.restore();
  }

  function renderUpgradesList() {
    $('upgradeCoins').innerHTML = `<i class="ic ic-coin"></i>${Save.coins}`;
    const list = $('upgradesList');
    list.innerHTML = '';
    UPGRADES.forEach(u => {
      const lvl = Save.upgrades[u.id];
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : upgradeCost(u, lvl);
      const card = document.createElement('div'); card.className = 'upgradeCard';
      let dots = '';
      for (let i = 0; i < u.max; i++) dots += `<div class="dot${i < lvl ? ' filled' : ''}"></div>`;
      card.innerHTML = `
        <div class="upgradeTopRow"><span class="upgradeName">${u.name}</span><span class="upgradeLevel">${lvl}/${u.max}</span></div>
        <div class="dotsRow">${dots}</div>
        <div class="upgradeTopRow"><span class="upgradeLevel">${u.step}</span>
          <div class="upgradeBtnRow"><button class="buyBtn" ${maxed || Save.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : 'Buy · ' + cost}</button></div>
        </div>`;
      card.querySelector('.buyBtn').addEventListener('click', () => {
        if (maxed || Save.coins < cost) return;
        Save.coins -= cost; Save.upgrades[u.id]++;
        AudioSys.uiClick(); haptic(15);
        if (Run.shark) {
          Run.shark.maxBoost = 100 * (1 + 0.15 * Save.upgrades.boost);
          Run.shark.maxHunger = 100 * (1 + 0.2 * Save.upgrades.hunger);
          Run.shark.maxHealth = 100 + 20 * Save.upgrades.health;
        }
        persistSave();
        renderUpgradesList();
      });
      list.appendChild(card);
    });
  }

  function renderMissionsList() {
    const list = $('missionsList');
    list.innerHTML = '';
    MISSIONS.forEach(m => {
      const done = !!Save.missionsDone[m.id];
      const prog = done ? m.target : (Save.missions[m.id] || 0);
      const card = document.createElement('div'); card.className = 'missionCard' + (done ? ' done' : '');
      card.innerHTML = `
        <div class="missionTitle"><span>${m.text}</span><span>${done ? '✓' : prog + '/' + m.target}</span></div>
        <div class="barTrack"><div class="barFill missionFill" style="width:${clamp(prog / m.target, 0, 1) * 100}%"></div></div>`;
      list.appendChild(card);
    });
  }

  function renderMenuChips() {
    $('menuLevelChip').textContent = 'Lv.' + Save.level;
    $('menuCoinChip').textContent = Save.coins;
  }

  function refreshToggleButtons() {
    $('toggleSFX').dataset.on = Save.settings.sfx ? '1' : '0';
    $('toggleAmbience').dataset.on = Save.settings.ambience ? '1' : '0';
    $('toggleShake').dataset.on = Save.settings.shake ? '1' : '0';
    $('toggleHaptics').dataset.on = Save.settings.haptics ? '1' : '0';
  }

  /* ============================== FLOW CONTROL ============================== */
  function resetRun(freshStart) {
    Run.shark = makeShark();
    Run.creatures = []; Run.treasures = []; Run.schools = [];
    Run.boss = null; Run.bossState = 'none'; Run.bossCooldown = 0;
    $('bossBarWrap').classList.add('hidden');
    Run.comboCount = 0; Run.comboTimer = 0; Run.bestComboRun = 0;
    Run.runTimer = 0; Run.coinsEarnedRun = 0; Run.xpEarnedRun = 0;
    Run.camera.x = Run.shark.x; Run.camera.y = Run.shark.y;
    Run.lastZoneIndex = -1;
    Run.shake = 0;
  }
  function startRun() {
    resetRun(true);
    hideAllScreens();
    $('hud').classList.remove('hidden');
    $('controls').classList.remove('hidden');
    Run.state = 'playing';
    AudioSys.refreshAmbience();
    updateZoneTracking();
  }
  function pauseGame() {
    if (Run.state !== 'playing') return;
    Run.state = 'paused';
    openScreen('pauseMenu');
  }
  function resumeGame() {
    Run.state = 'playing';
    hideAllScreens();
  }
  function backToMainMenu() {
    Run.state = 'menu';
    $('hud').classList.add('hidden');
    $('controls').classList.add('hidden');
    renderMenuChips();
    openScreen('mainMenu');
  }
  function finishGameOver() {
    Run.state = 'gameover';
    $('hud').classList.add('hidden');
    $('controls').classList.add('hidden');
    $('gameOverStats').innerHTML = `
      <div class="statRow"><span>Coins earned</span><b>${Run.coinsEarnedRun}</b></div>
      <div class="statRow"><span>XP earned</span><b>${Run.xpEarnedRun}</b></div>
      <div class="statRow"><span>Best combo</span><b>x${Run.bestComboRun}</b></div>
      <div class="statRow"><span>Score</span><b>${Run.xpEarnedRun + Run.coinsEarnedRun * 2}</b></div>
    `;
    persistSave();
    openScreen('gameOverScreen');
  }

  /* =============================== MISSIONS TICK ============================= */
  function tickSurvive(dt) {
    Run.runTimer += dt;
    updateMissionsProgress('survive', { t: Run.runTimer });
  }

  /* ================================ MAIN LOOP ================================ */
  let lastT = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = clamp(dt, 0, 0.05);
    Run.time += dt;

    if (Run.state === 'playing') {
      manageSpawns(dt);
      updateSchools(dt);
      for (const c of Run.creatures) updateCreatureAI(c, dt);
      updateShark(dt);
      checkCollisions(dt);
      if (Run.comboTimer > 0) { Run.comboTimer -= dt; if (Run.comboTimer <= 0) Run.comboCount = 0; }
      updateZoneTracking();
      if (Run.bossCooldown > 0) Run.bossCooldown -= dt;
      if (Run.bossState === 'none' || (Run.bossState === 'defeated' && Run.bossCooldown <= 0)) { if (Run.bossState === 'defeated') Run.bossState = 'none'; maybeTriggerBoss(); }
      updateBoss(dt);
      updateCamera(dt);
      tickSurvive(dt);
      updateParticles(dt);
      syncHUD();
      render();
      saveTimer += dt;
      if (saveTimer > 5) { saveTimer = 0; persistSave(); }
    } else if (Run.state === 'boot' || Run.state === 'menu') {
      updateParticles(dt);
    }
  }
  requestAnimationFrame(loop);

  /* ================================ UI WIRING ================================ */
  function boot() {
    AudioSys.resume();
    $('bootScreen').classList.add('hidden');
    renderMenuChips();
    openScreen('mainMenu');
    Run.state = 'menu';
  }
  $('bootScreen').addEventListener('touchend', boot, { once: true });
  $('bootScreen').addEventListener('click', boot, { once: true });

  $('btnPlay').addEventListener('click', () => { AudioSys.uiClick(); startRun(); });
  $('btnShark').addEventListener('click', () => { AudioSys.uiClick(); if (!Run.shark) Run.shark = makeShark(); renderSharkStats(); openScreen('sharkScreen', 'mainMenu'); });
  $('btnUpgrades').addEventListener('click', () => { AudioSys.uiClick(); renderUpgradesList(); openScreen('upgradesScreen', 'mainMenu'); });
  $('btnMissions').addEventListener('click', () => { AudioSys.uiClick(); renderMissionsList(); openScreen('missionsScreen', 'mainMenu'); });
  $('btnSettings').addEventListener('click', () => { AudioSys.uiClick(); refreshToggleButtons(); openScreen('settingsScreen', 'mainMenu'); });

  document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => {
    AudioSys.uiClick();
    openScreen(Run.prevScreen === 'pauseMenu' ? 'pauseMenu' : 'mainMenu');
    if (Run.prevScreen === 'pauseMenu') Run.state = 'paused';
  }));

  $('btnPause').addEventListener('click', () => { AudioSys.uiClick(); pauseGame(); });
  $('btnResume').addEventListener('click', () => { AudioSys.uiClick(); resumeGame(); });
  $('btnPauseSettings').addEventListener('click', () => { AudioSys.uiClick(); refreshToggleButtons(); openScreen('settingsScreen', 'pauseMenu'); });
  $('btnPauseMainMenu').addEventListener('click', () => { AudioSys.uiClick(); AudioSys.stopAmbience(); backToMainMenu(); });

  $('btnRetry').addEventListener('click', () => { AudioSys.uiClick(); startRun(); });
  $('btnGameOverMenu').addEventListener('click', () => { AudioSys.uiClick(); AudioSys.stopAmbience(); backToMainMenu(); });

  function toggleSetting(key, btnId) {
    Save.settings[key] = !Save.settings[key];
    $(btnId).dataset.on = Save.settings[key] ? '1' : '0';
    persistSave();
    AudioSys.uiClick();
    if (key === 'ambience') AudioSys.refreshAmbience();
  }
  $('toggleSFX').addEventListener('click', () => toggleSetting('sfx', 'toggleSFX'));
  $('toggleAmbience').addEventListener('click', () => toggleSetting('ambience', 'toggleAmbience'));
  $('toggleShake').addEventListener('click', () => toggleSetting('shake', 'toggleShake'));
  $('toggleHaptics').addEventListener('click', () => toggleSetting('haptics', 'toggleHaptics'));
  $('btnResetSave').addEventListener('click', () => {
    if (!confirm('Reset all progress? This cannot be undone.')) return;
    Save = defaultSave();
    persistSave();
    renderMenuChips();
    toast('Progress reset');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Run.state === 'playing') pauseGame();
  });

  window.addEventListener('beforeunload', persistSave);
})();