/*
 * GTA.js save / load — userspace, no engine patching.
 *
 * Level 1 (always): player position + heading, weapons/ammo, HUD economy
 *   (score, lives, multiplier, armor, jail key, wanted level), vehicle model
 *   if driving (respawned next to you on load, you start on foot).
 * Level 2 (experimental): MISSION.INI engine state *between missions* —
 *   processes, trigger enabled flags, counters, collected/destroyed sets,
 *   phones, doors, completed count. Only captured when no mission entity is
 *   alive (no mission peds, timers, kill frenzy, pending vehicles) and the
 *   startup phase has finished; otherwise the save is player-only and says so.
 *
 * Slots: "manual" (SAVE/LOAD pills) and "auto" (every AUTOSAVE_MS and when the
 * tab is hidden). Saves are keyed by the bundle hash so a re-mirrored build
 * never loads an incompatible snapshot.
 */
(() => {
  'use strict';

  const VERSION = 1;
  const AUTOSAVE_MS = 30000;
  const PREFIX = 'gtajs-mobile-save:';
  const BUILD = (() => {
    const s = document.querySelector('script[src*="play-"]');
    const m = s && /play-([A-Za-z0-9_-]+)\.js/.exec(s.getAttribute('src') || '');
    return m ? m[1] : 'unknown';
  })();

  const AMMO_SLOTS = [1, 2, 3, 4, 5];
  const MISSION_SETS = [
    'collectedPowerupIds',
    'destroyedObjectIds',
    'explodedVehicles',
    'usedMPhoneIds',
    'openDoors',
    'ringingPhoneIds',
    'answeredPhoneQueue',
    'activeBankAlarmIds',
  ];
  const MISSION_MAPS = ['gtaDemandDeliveredCounts'];
  const MISSION_SCALARS = [
    'missionsCompletedCount',
    'missionsFailedCount',
    'lastBriefId',
    'lastPagerBriefId',
    'nextProcessId',
    'arrowTargetId',
    'arrowSecondaryTargetId',
    'followPedPunchEnabled',
    'isInitialStartupPhase',
  ];

  const game = () => window.game;

  // ---------- Snapshot ----------
  function plain(v) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'function') return undefined;
    if (v instanceof Set) return { __set: [...v].map(plain) };
    if (v instanceof Map) return { __map: [...v].map(([k, x]) => [k, plain(x)]) };
    if (Array.isArray(v)) return v.map(plain);
    if (v.isObject3D || ArrayBuffer.isView(v)) return undefined;
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      const px = plain(x);
      if (px !== undefined) o[k] = px;
    }
    return o;
  }
  function revive(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(revive);
    if (v.__set) return new Set(v.__set.map(revive));
    if (v.__map) return new Map(v.__map.map(([k, x]) => [k, revive(x)]));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = revive(x);
    return o;
  }

  // Note: isInitialStartupPhase stays true until the first mission is taken
  // ("no mission started yet"), so it is not a safety condition.
  function missionIsQuiet(me) {
    return (
      !!me &&
      (!me.pedestrians || me.pedestrians.size === 0) &&
      !me.activeTimer &&
      !me.activeKillFrenzy &&
      !me.pendingParkVehicle &&
      !me.pendingGtaVehicle
    );
  }

  function canSave() {
    const g = game();
    const pl = g && g.player;
    if (!pl || g.isGameOver || pl.waterDeathState) return false;
    const open = (d) => !!d && (typeof d.isOpen === 'function' ? d.isOpen() : !!(d.dialog && d.dialog.open));
    return !(open(g.introDialog) || open(g.gameDialog) || open(g.missionErrorDialog));
  }

  function snapshot() {
    const g = game();
    const pl = g.player;
    const hud = g.hud;
    const me = g.missionEngine;
    const inVehicle = !!(pl.inVehicle && pl.currentVehicle);
    const carIndex = inVehicle && g.styleData && pl.currentCarDef ? g.styleData.cars.indexOf(pl.currentCarDef) : -1;
    const ammo = {};
    for (const k of AMMO_SLOTS) ammo[k] = pl.ammo ? pl.ammo[k] ?? -1 : -1;

    const data = {
      v: VERSION,
      ts: Date.now(),
      build: BUILD,
      suburb: g.lastSuburbName || '',
      player: {
        x: pl.position.x,
        y: pl.position.y,
        z: inVehicle ? pl.groundZ : pl.position.z,
        r: inVehicle ? pl.currentVehicle.sprite.rotation.z : pl.spriteMesh.rotation.z,
        weapon: pl.weapon,
        ammo,
        carIndex,
      },
      hud: {
        score: hud.score,
        lives: hud.lives,
        multiplier: hud.multiplier,
        armor: hud.armor,
        hasJailKey: hud.hasJailKey,
        wantedLevel: hud.wantedLevel,
      },
      mission: null,
    };

    if (missionIsQuiet(me)) {
      const m = { processes: plain(me.processes), triggers: {}, counters: plain(me.counters), sets: {}, maps: {}, scalars: {} };
      for (const [id, t] of me.triggers) m.triggers[id] = { enabled: !!t.enabled, linkedProcesses: plain(t.linkedProcesses) };
      for (const k of MISSION_SETS) if (me[k] instanceof Set) m.sets[k] = plain(me[k]);
      for (const k of MISSION_MAPS) if (me[k] instanceof Map) m.maps[k] = plain(me[k]);
      for (const k of MISSION_SCALARS) m.scalars[k] = me[k] ?? null;
      data.mission = m;
    }
    return data;
  }

  // ---------- Restore ----------
  function restorePlayer(data) {
    const g = game();
    const pl = g.player;
    const hud = g.hud;
    const P = data.player;

    if (g.isGameOver) g.restartGame();
    if (pl.inVehicle && typeof pl.exitVehicle === 'function') {
      try { pl.exitVehicle(); } catch { /* ignore */ }
    }

    // Block-level teleport (camera, visible sections, pedestrians, physics
    // world) — the engine snaps to block centres, so then set the exact
    // position on both the Object3D and the physics body (world/10, y flipped).
    g.teleportPlayer(Math.round(P.x / 64), -Math.round(P.y / 64), Math.round(P.z / 64));
    const gz = g.map ? g.map.getGroundZAt(P.x, P.y, P.z) : P.z;
    pl.position.set(P.x, P.y, gz);
    pl.groundZ = gz;
    if (pl.physicsBody && pl.physicsBody.getPosition) {
      const v = pl.physicsBody.getPosition();
      v.x = P.x / 10;
      v.y = -P.y / 10;
      pl.physicsBody.setPosition(v);
      const lv = pl.physicsBody.getLinearVelocity();
      lv.x = 0;
      lv.y = 0;
      pl.physicsBody.setLinearVelocity(lv);
    }
    g.camera.position.x = pl.position.x;
    g.camera.position.y = pl.position.y;

    // Heading: sprite r ↔ physics angle n = π/2 − r (mirrors setGtaAngle).
    const n = Math.PI / 2 - P.r;
    if (pl.physicsBody && pl.physicsBody.setAngle) pl.physicsBody.setAngle(n);
    if (pl.spriteMesh) pl.spriteMesh.rotation.z = P.r;

    for (const k of AMMO_SLOTS) {
      const v = P.ammo[k] ?? -1;
      if (pl.ammo) pl.ammo[k] = v;
      if (hud.ammo && hud.ammo !== pl.ammo) hud.ammo[k] = v;
    }
    if (!pl.selectWeapon(P.weapon)) pl.selectWeapon(0);
    hud.weaponIndex = pl.weapon;

    Object.assign(hud, data.hud);

    if (P.carIndex >= 0 && typeof g.spawnVehicleNearPlayer === 'function') {
      try { g.spawnVehicleNearPlayer(P.carIndex); } catch { /* ignore */ }
    }
    g.statusMessage = 'Game loaded';
  }

  function restoreMission(data) {
    const g = game();
    const me = g.missionEngine;
    const M = data.mission;
    if (!me || !M) return false;

    me.processes.length = 0;
    for (const p of revive(M.processes)) me.processes.push(p);
    for (const [id, t] of Object.entries(M.triggers)) {
      const live = me.triggers.get(id);
      if (!live) continue;
      live.enabled = t.enabled;
      if (live.linkedProcesses instanceof Set) {
        live.linkedProcesses.clear();
        for (const x of revive(t.linkedProcesses)) live.linkedProcesses.add(x);
      }
    }
    const counters = revive(M.counters);
    if (counters instanceof Map) for (const [k, v] of counters) me.counters.set(k, v);
    for (const [k, s] of Object.entries(M.sets)) {
      if (!(me[k] instanceof Set)) continue;
      me[k].clear();
      for (const x of revive(s)) me[k].add(x);
    }
    for (const [k, m] of Object.entries(M.maps)) {
      if (!(me[k] instanceof Map)) continue;
      me[k].clear();
      for (const [kk, v] of revive(m)) me[k].set(kk, v);
    }
    for (const [k, v] of Object.entries(M.scalars)) if (v !== null) me[k] = v;
    me.tickAccumulator = 0;
    if (typeof me.syncHudArrow === 'function') me.syncHudArrow();
    return true;
  }

  // ---------- Storage ----------
  function slotKey(slot) {
    return PREFIX + slot;
  }
  function readSlot(slot) {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION || d.build !== BUILD) return null;
      return d;
    } catch {
      return null;
    }
  }
  function writeSlot(slot, data) {
    try {
      localStorage.setItem(slotKey(slot), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function save(slot) {
    if (!canSave()) return null;
    const data = snapshot();
    if (!writeSlot(slot, data)) {
      toast('Save failed (storage)');
      return null;
    }
    if (slot === 'manual') toast(data.mission ? 'Saved' : 'Saved (player only: mission in progress)');
    return data;
  }

  // `playerOnly` skips the mission state.
  function load(slot, playerOnly) {
    const data = readSlot(slot);
    if (!data) {
      toast('No save in this slot');
      return;
    }
    const wantMission = !playerOnly && !!data.mission;
    try {
      restorePlayer(data);
      const didMission = wantMission && restoreMission(data);
      toast(didMission ? 'Loaded' : data.mission ? 'Loaded (player only)' : 'Loaded (player only: save had no mission state)');
    } catch (err) {
      console.error('[gtajs-mobile] load failed', err);
      toast('Load failed: ' + (err && err.message ? err.message : err));
    }
  }

  // ---------- UI ----------
  const host = () => (window.gtaMobile && window.gtaMobile.root) || document.body;
  const ui = document.createElement('div');
  ui.id = 'gtaSave';
  ui.innerHTML = `
    <button type="button" class="gta-pill" id="gtaSaveBtn">Save</button>
    <button type="button" class="gta-pill" id="gtaLoadBtn">Load</button>
    <div id="gtaToast" hidden><span></span><button type="button" id="gtaToastAction" hidden></button></div>
    <div id="gtaLoadMenu" hidden>
      <div class="gta-loadmenu-title">Load game</div>
      <div class="gta-loadmenu-rows"></div>
      <button type="button" class="gta-loadmenu-cancel">Cancel</button>
    </div>
  `;
  const mount = () => host().appendChild(ui);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // touchstart is cancelled on the overlay (mobile.js), so no click arrives:
  // every control acts on pointerup.
  const onTap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('is-down');
    });
    el.addEventListener('pointerup', (e) => {
      el.classList.remove('is-down');
      e.preventDefault();
      setTimeout(fn, 0);
    });
    el.addEventListener('pointercancel', () => el.classList.remove('is-down'));
  };

  const toastEl = ui.querySelector('#gtaToast');
  const toastText = toastEl.querySelector('span');
  const toastAction = ui.querySelector('#gtaToastAction');
  let toastTimer = 0;
  let toastActionFn = null;
  function toast(msg, ms = 2500, action) {
    toastText.textContent = msg;
    toastAction.hidden = !action;
    toastActionFn = action ? action.fn : null;
    if (action) toastAction.textContent = action.label;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
  }
  onTap(toastAction, () => {
    toastEl.hidden = true;
    if (toastActionFn) toastActionFn();
  });

  onTap(ui.querySelector('#gtaSaveBtn'), () => {
    if (!canSave()) return toast('Cannot save right now');
    save('manual');
  });

  const menu = ui.querySelector('#gtaLoadMenu');
  const rows = menu.querySelector('.gta-loadmenu-rows');
  onTap(ui.querySelector('#gtaLoadBtn'), () => openLoadMenu());
  onTap(menu.querySelector('.gta-loadmenu-cancel'), () => (menu.hidden = true));

  function fmt(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function openLoadMenu() {
    rows.innerHTML = '';
    let any = false;
    for (const slot of ['manual', 'auto']) {
      const d = readSlot(slot);
      if (!d) continue;
      any = true;
      const row = document.createElement('div');
      row.className = 'gta-loadmenu-row';
      row.innerHTML = `
        <div class="gta-loadmenu-info"><strong>${slot === 'manual' ? 'Manual' : 'Autosave'}</strong>
          <small>${fmt(d.ts)} · ${d.suburb || '?'} · $${d.hud.score}${d.mission ? '' : ' · player only'}</small></div>
        <button type="button" class="gta-loadmenu-btn" data-full>Load</button>
        <button type="button" class="gta-loadmenu-btn gta-loadmenu-btn-alt" ${d.mission ? '' : 'hidden'}>Player only</button>`;
      onTap(row.querySelector('[data-full]'), () => { menu.hidden = true; load(slot, false); });
      onTap(row.querySelector('.gta-loadmenu-btn-alt'), () => { menu.hidden = true; load(slot, true); });
      rows.appendChild(row);
    }
    if (!any) return toast('No saved games yet');
    menu.hidden = false;
  }

  // ---------- Autosave + resume prompt ----------
  let resumeOffered = false;
  setInterval(() => {
    if (!canSave()) return;
    if (!resumeOffered) {
      resumeOffered = true;
      const auto = readSlot('auto');
      const manual = readSlot('manual');
      const best = [auto, manual].filter(Boolean).sort((a, b) => b.ts - a.ts)[0];
      if (best) {
        const slot = best === auto ? 'auto' : 'manual';
        toast(`Resume ${slot === 'auto' ? 'autosave' : 'save'} from ${fmt(best.ts)}?`, 12000, { label: 'Resume', fn: () => load(slot, false) });
        return; // don't overwrite the autosave before the player decides
      }
    }
    save('auto');
  }, AUTOSAVE_MS);
  const onHide = () => { if (canSave() && resumeOffered) save('auto'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); });
  window.addEventListener('pagehide', onHide);

  window.gtaSave = { save, load, snapshot, readSlot, canSave, missionIsQuiet: () => missionIsQuiet(game() && game().missionEngine) };
})();
