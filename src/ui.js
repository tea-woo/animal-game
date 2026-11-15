// UI — 지도 선택, 동물 카드, HUD, 토스트
import { ANIMALS } from './animals.js?v=20261115c';
import { MAPS } from './world.js?v=20261115c';
import { clamp } from './util.js?v=20261115c';

const BIOME_ORDER = ['savanna', 'ocean', 'forest', 'snow'];

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: document.getElementById('hud'),
      select: document.getElementById('select'),
      cards: document.getElementById('cards'),
      mapCards: document.getElementById('map-cards'),
      mapCardsGame: document.getElementById('map-cards-game'),
      mapHint: document.getElementById('map-hint'),
      mapMenu: document.getElementById('mapmenu'),
      btnMap: document.getElementById('btn-map'),
      btnMapClose: document.getElementById('btn-map-close'),
      loading: document.getElementById('loading'),
      death: document.getElementById('death'),
      toast: document.getElementById('toast'),
      combo: document.getElementById('combo'),
      comboNum: document.getElementById('combo-num'),
      emoji: document.getElementById('animal-emoji'),
      name: document.getElementById('animal-name'),
      tag: document.getElementById('animal-tag'),
      hpFill: document.getElementById('hp-fill'),
      hpText: document.getElementById('hp-text'),
      stFill: document.getElementById('st-fill'),
      stText: document.getElementById('st-text'),
      kills: document.getElementById('kill-count'),
      fps: document.getElementById('fps'),
      buff: document.getElementById('buff-pill'),
      btnChange: document.getElementById('btn-change'),
      btnHelp: document.getElementById('btn-help'),
      help: document.getElementById('help'),
      skill1: document.getElementById('btn-skill1'),
      skill2: document.getElementById('btn-skill2'),
      skill1Icon: document.getElementById('skill1-icon'),
      skill1Label: document.getElementById('skill1-label'),
      skill2Icon: document.getElementById('skill2-icon'),
      skill2Label: document.getElementById('skill2-label'),
      attack: document.getElementById('btn-attack'),
    };
    this.lastCombo = 0;
    this.toastUntil = 0;
    this.buildMaps();
    this.buildCards();
    this.bind();
  }

  // ── 지도 ────────────────────────────────────────────────
  mapCardHtml(m, active) {
    return `
      <button type="button" class="map-card${active ? ' on' : ''}" data-map="${m.id}" style="--map-accent:${m.accent}">
        <span class="map-emoji">${m.emoji}</span>
        <span>
          <strong>${m.name}</strong>
          <small>${m.tagline}</small>
        </span>
      </button>`;
  }

  buildMaps() {
    const current = this.game.mapId || 'savanna';
    const ids = Object.keys(MAPS);
    for (const box of [this.el.mapCards, this.el.mapCardsGame]) {
      if (!box) continue;
      box.innerHTML = ids.map((id) => this.mapCardHtml(MAPS[id], id === current)).join('');
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-map]');
        if (!btn) return;
        this.game.sfx.ui();
        this.game.setMap(btn.dataset.map);
        if (this.el.mapMenu && !this.el.mapMenu.classList.contains('hidden')) this.closeMapMenu();
      });
    }
    this.setMapActive(current);
  }

  setMapActive(id) {
    const m = MAPS[id] || MAPS.savanna;
    document.querySelectorAll('.map-card').forEach((el) => el.classList.toggle('on', el.dataset.map === id));
    if (this.el.btnMap) this.el.btnMap.textContent = `🗺 ${m.name}`;
    if (this.el.mapHint) this.el.mapHint.textContent = `지금 무대 · ${m.name}`;
  }

  openMapMenu() {
    if (!this.el.mapMenu) return;
    this.el.mapMenu.classList.remove('hidden');
    this.game.openMapMenu();
  }

  closeMapMenu() {
    this.el.mapMenu?.classList.add('hidden');
    this.game.closeMapMenu();
  }

  // ── 동물 카드 ───────────────────────────────────────────
  buildCards() {
    const wrap = this.el.cards;
    wrap.innerHTML = '';
    for (const biomeId of BIOME_ORDER) {
      const entries = Object.entries(ANIMALS).filter(([, a]) => (a.biomes || [])[0] === biomeId);
      if (!entries.length) continue;
      const group = document.createElement('div');
      group.className = 'animal-group';
      const head = document.createElement('div');
      head.className = 'animal-group-head';
      head.innerHTML = `<b>${MAPS[biomeId].emoji} ${MAPS[biomeId].name}</b><span>이 지형에 어울리는 동물</span><i class="bar"></i>`;
      group.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'cards';
      for (const [key, a] of entries) grid.appendChild(this.makeCard(key, a));
      group.appendChild(grid);
      wrap.appendChild(group);
      // 카드 등장 애니메이션 딜레이
      grid.querySelectorAll('.card').forEach((c, i) => {
        c.style.animationDelay = `${Math.min(0.4, i * 0.05)}s`;
      });
    }
  }

  makeCard(key, a) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.animal = key;
    card.style.setProperty('--accent', a.accent);
    const tags = (a.biomes || [])
      .map((b, i) => {
        const m = MAPS[b];
        if (!m) return '';
        return `<span class="biome-tag${i === 0 ? ' rec' : ''}">${m.emoji} ${m.name}</span>`;
      })
      .join('');
    card.innerHTML = `
      <div class="card-head">
        <span class="card-emoji">${a.emoji}</span>
        <div>
          <strong>${a.name}</strong>
          <span class="card-tag">${a.tagline}</span>
        </div>
      </div>
      <div class="card-biomes">${tags}</div>
      <p class="card-desc">${a.desc}</p>
      <div class="stats">
        ${this.statRow('공격', a.stats.power)}
        ${this.statRow('속도', a.stats.speed)}
        ${this.statRow('체력', a.stats.tough)}
      </div>
      <div class="skill-lines">
        <div class="skill-line"><b>J</b><span>${a.attack.name}</span></div>
        <div class="skill-line"><b>K</b><span>${a.skills[0].name}<em>${a.skills[0].desc}</em></span></div>
        <div class="skill-line"><b>L</b><span>${a.skills[1].name}<em>${a.skills[1].desc}</em></span></div>
      </div>
      <span class="card-cta">스폰하기 <i>→</i></span>
    `;
    card.addEventListener('click', () => {
      this.game.sfx.ui();
      this.game.selectAnimal(key);
    });
    return card;
  }

  statRow(label, value) {
    let pips = '';
    for (let i = 0; i < 5; i++) pips += `<i class="${i < value ? 'on' : ''}"></i>`;
    return `<div class="stat"><span>${label}</span><div class="pips">${pips}</div></div>`;
  }

  bind() {
    this.el.btnChange?.addEventListener('click', () => {
      if (this.game.player.dead) return;
      this.game.sfx.ui();
      this.game.openSelect();
    });
    this.el.btnHelp?.addEventListener('click', () => {
      this.el.help.classList.toggle('hidden');
      this.game.sfx.ui();
    });
    this.el.btnMap?.addEventListener('click', () => {
      if (this.game.player.dead) return;
      this.game.sfx.ui();
      this.openMapMenu();
    });
    this.el.btnMapClose?.addEventListener('click', () => {
      this.game.sfx.ui();
      this.closeMapMenu();
    });
  }

  hideLoading() {
    this.el.loading?.classList.add('hidden');
  }

  showSelect() {
    this.el.select?.classList.remove('hidden');
    this.el.hud?.classList.add('blurred');
  }

  hideSelect() {
    this.el.select?.classList.add('hidden');
    this.el.hud?.classList.remove('blurred');
    this.el.hud?.classList.remove('hidden');
  }

  setAnimal(cfg) {
    this.el.emoji.textContent = cfg.emoji;
    this.el.name.textContent = cfg.name;
    this.el.tag.textContent = cfg.tagline;
    this.el.skill1Icon.textContent = cfg.skills[0].icon;
    this.el.skill1Label.textContent = cfg.skills[0].short;
    this.el.skill2Icon.textContent = cfg.skills[1].icon;
    this.el.skill2Label.textContent = cfg.skills[1].short;
    this.el.hud.style.setProperty('--accent', cfg.accent);
    this.el.hpFill.style.background = `linear-gradient(90deg, #ff4d4d, ${cfg.accent})`;
  }

  toast(msg) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    this.toastUntil = performance.now() + 1700;
  }

  popCombo(n) {
    this.lastCombo = n;
  }

  flashSkill(i) {
    const el = i === 0 ? this.el.skill1 : this.el.skill2;
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  showDeath() {
    this.el.death?.classList.remove('hidden');
  }

  hideDeath() {
    this.el.death?.classList.add('hidden');
  }

  setFps(v) {
    if (this.el.fps) this.el.fps.textContent = String(Math.round(v));
  }

  update(player, enemies) {
    const hpPct = clamp(player.hp / player.maxHp, 0, 1) * 100;
    this.el.hpFill.style.width = hpPct + '%';
    this.el.hpText.textContent = `${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`;
    this.el.stFill.style.width = clamp(player.stamina / player.maxStamina, 0, 1) * 100 + '%';
    this.el.stText.textContent = player.exhausted ? '기력 소진' : '기력';
    this.el.stFill.classList.toggle('low', player.exhausted);

    this.el.kills.textContent = String(enemies.kills);
    this.el.buff.hidden = !player.buffed;

    // 스킬 쿨다운
    if (player.cfg) {
      const cds = [this.el.skill1, this.el.skill2];
      for (let i = 0; i < 2; i++) {
        const s = player.cfg.skills[i];
        const btn = cds[i];
        if (!btn || !s) continue;
        const rem = player.cd[s.id] || 0;
        const pct = clamp(rem / s.cd, 0, 1);
        const mask = btn.querySelector('.cd');
        if (mask) mask.style.transform = `scaleY(${pct})`;
        btn.classList.toggle('cooling', pct > 0.02);
      }
    }

    // 콤보
    if (player.combo >= 2) {
      this.el.combo.classList.add('show');
      this.el.comboNum.textContent = String(player.combo);
      if (player.combo !== this.lastCombo) {
        this.lastCombo = player.combo;
        this.el.combo.classList.remove('pop');
        void this.el.combo.offsetWidth;
        this.el.combo.classList.add('pop');
      }
    } else {
      this.el.combo.classList.remove('show');
      this.lastCombo = 0;
    }

    if (this.toastUntil && performance.now() > this.toastUntil) {
      this.el.toast?.classList.remove('show');
      this.toastUntil = 0;
    }
  }
}
