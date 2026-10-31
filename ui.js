/* ==========================================================================
   UI.JS — Mobile Touch Controller & Cinematic Battle Player
   ========================================================================== */
const UI = {
  selectedUnitLoc: null, 
  playbackSpeed: 1,
  isAnimatingCombat: false,
  benchMinimized: true, // Bench minimized by default

  init() { this.populateReferenceModal(); },

  getUnitImagePath(cls, star, element) {
    const clsName = cls.charAt(0).toUpperCase() + cls.slice(1); 
    let elName = element.charAt(0).toUpperCase() + element.slice(1);
    if (elName === 'Shadow') elName = 'Dark'; 
    return `assets/${clsName}/${elName}/${clsName}_${star}_star_${elName.toLowerCase()}.png`;
  },
  handleImageError(imgEl, cls, star) {
    imgEl.onerror = null; imgEl.src = `assets/${cls.toLowerCase()}_${star}.svg`;
  },

  startGame(difficulty) {
    this.selectedUnitLoc = null; this.isAnimatingCombat = false; this.benchMinimized = true;
    BotAI.initBotPersonality(difficulty);
    Engine.createNewGame(difficulty);
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('bot-label').textContent = difficulty === 'easy' ? 'EASY BOT' : 'MED BOT';
    this.setStatusBanner(`Round 1: Buy units from the Market`);
    this.renderAll();
  },

  returnToMenu() {
    this.isAnimatingCombat = false;
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('settings-modal').classList.remove('active');
    document.getElementById('main-menu').classList.add('active');
  },

  forfeitGame() {
    Engine.state.player.losses = 6;
    Engine.state.phase = 'GAMEOVER';
    this.toggleModal('settings-modal', false);
    this.showGameOverModal();
  },

  undoAction() {
    if (Engine.state.phase === 'COMBAT' || Engine.state.phase === 'GAMEOVER') return;
    if (Engine.undo()) {
      this.selectedUnitLoc = null;
      this.setStatusBanner('Action undone.');
      this.renderAll();
    } else {
      this.setStatusBanner('Nothing to undo.');
    }
  },

  toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.add('active'); else el.classList.remove('active');
  },
  
  toggleBench() {
    this.benchMinimized = !this.benchMinimized;
    this.renderAll();
  },

  setSpeed(mult) { this.playbackSpeed = mult; },
  setStatusBanner(msg) { document.getElementById('combat-status-banner').textContent = msg; },

  advancePhase() {
    if (Engine.state.phase === 'MARKET') {
      Engine.state.phase = 'PREPARATION';
      this.benchMinimized = false; // Expand bench for placement
      this.selectedUnitLoc = null;
      this.setStatusBanner(`Preparation: Place units on your Board`);
    } else if (Engine.state.phase === 'PREPARATION') {
      this.startCombatPhase();
    }
    this.renderAll();
  },

  renderAll() {
    const state = Engine.state;
    if (!state) return;

    // Apply Phase CSS to Body
    document.body.className = `phase-${state.phase.toLowerCase()}`;
    const btnNext = document.getElementById('btn-next-phase');
    if (state.phase === 'MARKET') btnNext.textContent = "➡️ Proceed to Preparation Phase";
    else if (state.phase === 'PREPARATION') btnNext.textContent = "⚔️ BATTLE!";

    // Bench Toggle
    const benchContainer = document.getElementById('bench-container');
    const toggleText = document.getElementById('bench-toggle-text');
    if (this.benchMinimized) {
      benchContainer.classList.add('minimized');
      toggleText.textContent = "[Show]";
    } else {
      benchContainer.classList.remove('minimized');
      toggleText.textContent = "[Hide]";
    }

    document.getElementById('hud-round').textContent = state.round;
    document.getElementById('hud-phase').textContent = state.phase;
    this.renderLossDots('player-losses', state.player.losses);
    this.renderLossDots('bot-losses', state.bot.losses);

    document.getElementById('player-board-title').textContent = `🛡️ Your Board (${Engine.getBoardCount(state.player)}/${state.player.unlockedSlots})`;
    document.getElementById('opp-board-title').textContent = `🤖 Bot Board (${Engine.getBoardCount(state.bot)}/${state.bot.unlockedSlots})`;
    document.getElementById('opp-gold-display').textContent = `🪙 ${state.bot.gold}`;
    document.getElementById('player-gold').textContent = state.player.gold;
    document.getElementById('bench-count').textContent = state.player.bench.length;

    const btnSlot = document.getElementById('btn-buy-slot');
    if (state.player.unlockedSlots >= 6) { btnSlot.disabled = true; btnSlot.textContent = `🔓 Max Slots`; } 
    else { btnSlot.disabled = state.player.gold < SLOT_UNLOCK_COSTS[state.player.unlockedSlots - 1]; }
    document.getElementById('btn-reroll').disabled = state.player.gold < 2;

    this.renderSynergyBar('player-synergies', state.player);
    this.renderSynergyBar('bot-synergies', state.bot);
    this.renderBoardZone(state.player, 'player');
    this.renderBoardZone(state.bot, 'bot');
    this.renderBench();
    this.renderMarket();
    this.renderActionToolbar();
  },

  renderLossDots(containerId, losses) {
    const c = document.getElementById(containerId); c.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement('div');
      dot.className = 'skull-dot' + (i < losses ? ' lost' : '');
      c.appendChild(dot);
    }
  },

  renderSynergyBar(containerId, pState) {
    const c = document.getElementById(containerId); c.innerHTML = '';
    const { classCounts, elementCounts } = Engine.computeSynergies(pState);
    Object.entries(classCounts).forEach(([cls, count]) => { if(count>=2) c.innerHTML += `<span class="syn-badge active-syn">${UNIT_STATS[cls].icon}${cls} ${count}</span>`; });
    Object.entries(elementCounts).forEach(([el, count]) => { if(count>=2) c.innerHTML += `<span class="syn-badge active-syn">${ELEMENT_ICONS[el]}${el} ${count}</span>`; });
  },

  renderBoardZone(pState, side) {
    const fuseIds = new Set();
    if(side==='player') Engine.getFusionCandidates(pState).forEach(c => c.items.forEach(i => fuseIds.add(i.unit.id)));
    ['front', 'back'].forEach(row => {
      for (let col = 0; col < 3; col++) {
        const slotEl = document.querySelector(`#${side==='player'?'player':'opp'}-${row}-row .board-slot[data-col="${col}"]`);
        if (!slotEl) continue;
        slotEl.innerHTML = '';
        if (side === 'player' && this.selectedUnitLoc && ['MARKET','PREPARATION'].includes(Engine.state.phase)) slotEl.classList.add('slot-highlight');
        else slotEl.classList.remove('slot-highlight');

        const unit = pState.board[row][col];
        if (unit) {
          const eff = Engine.getEffectiveUnitStats(pState, unit, row);
          const isSelected = side === 'player' && this.selectedUnitLoc?.zone === 'board' && this.selectedUnitLoc.row === row && this.selectedUnitLoc.col === col;
          slotEl.appendChild(this.createUnitCardDOM(unit, { ap: eff.ap, hp: eff.hp, maxHp: eff.hp, penaltyText: eff.penaltyText, isSelected, canFuse: fuseIds.has(unit.id) }));
        }
      }
    });
  },

  renderBench() {
    const benchEl = document.getElementById('player-bench'); benchEl.innerHTML = '';
    const pState = Engine.state.player;
    const fuseIds = new Set(); Engine.getFusionCandidates(pState).forEach(c => c.items.forEach(i => fuseIds.add(i.unit.id)));
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div'); slot.className = 'bench-slot';
      const unit = pState.bench[i];
      if (unit) {
        const isSelected = this.selectedUnitLoc?.zone === 'bench' && this.selectedUnitLoc.index === i;
        slot.onclick = () => this.onBenchSlotClick(i);
        slot.appendChild(this.createUnitCardDOM(unit, { ap: unit.baseAp, hp: unit.baseHp, maxHp: unit.baseHp, isSelected, canFuse: fuseIds.has(unit.id) }));
      } else { slot.onclick = () => this.onEmptyBenchSlotClick(); }
      benchEl.appendChild(slot);
    }
  },

  renderMarket() {
    const marketEl = document.getElementById('market-cards'); marketEl.innerHTML = '';
    Engine.state.market.forEach((unit, idx) => {
      const wrap = document.createElement('div'); wrap.className = 'market-slot';
      if (unit) {
        const card = this.createUnitCardDOM(unit, { ap: unit.baseAp, hp: unit.baseHp, isMarket: true });
        card.onclick = () => this.onBuyMarketCard(idx); wrap.appendChild(card);
      }
      marketEl.appendChild(wrap);
    });
  },

  createUnitCardDOM(unit, opts = {}) {
    const card = document.createElement('div');
    card.className = `unit-card el-${unit.element} ${opts.isSelected ? 'selected' : ''} ${opts.canFuse ? 'can-fuse' : ''} ${opts.dead ? 'dead-unit' : ''}`;
    const imgPath = this.getUnitImagePath(unit.cls, unit.star, unit.element);
    card.innerHTML = `
      <div class="unit-art-wrap"><img src="${imgPath}" onerror="UI.handleImageError(this, '${unit.cls}', ${unit.star}, '${unit.element}')" /></div>
      <div class="unit-top">
        <span class="unit-stars">${'★'.repeat(unit.star)}</span>
        <span>${ELEMENT_ICONS[unit.element]}</span>
      </div>
      ${opts.penaltyText ? `<div class="unit-role-warning">⚠️</div>` : ''}
      <div class="unit-name">${unit.cls}</div>
      <div class="unit-bottom">
        <span class="stat-ap">⚔️${opts.ap}</span>
        <span class="stat-hp">❤️${opts.hp}</span>
      </div>
      ${opts.isMarket ? `<div class="market-card-cost">🪙 3G</div>` : `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${opts.maxHp ? Math.max(0, Math.min(100, Math.round((opts.hp/opts.maxHp)*100))) : 100}%"></div></div>`}
    `;
    return card;
  },

  renderActionToolbar() {
    const infoEl = document.getElementById('selected-unit-info');
    const btnFuse = document.getElementById('btn-fuse'), btnToBench = document.getElementById('btn-to-bench'), btnSell = document.getElementById('btn-sell');
    const cands = Engine.getFusionCandidates(Engine.state.player);
    if (cands.length > 0 && ['MARKET','PREPARATION'].includes(Engine.state.phase)) {
      btnFuse.classList.remove('hidden'); btnFuse.textContent = `✨ Fuse ${cands[0].cls}`;
    } else { btnFuse.classList.add('hidden'); }

    if (!this.selectedUnitLoc || !['MARKET','PREPARATION'].includes(Engine.state.phase)) {
      infoEl.textContent = 'Select a unit to move or sell';
      btnToBench.classList.add('hidden'); btnSell.classList.add('hidden'); return;
    }

    const unit = this.getSelectedUnitObj();
    if (!unit) { this.selectedUnitLoc = null; btnToBench.classList.add('hidden'); btnSell.classList.add('hidden'); return; }
    infoEl.textContent = `${unit.cls} (${unit.star}★ ${unit.element})`;
    btnSell.classList.remove('hidden'); btnSell.textContent = `💰 Sell (+${SELL_REFUND[unit.star] || 1}G)`;
    if (this.selectedUnitLoc.zone === 'board') btnToBench.classList.remove('hidden'); else btnToBench.classList.add('hidden');
  },

  getSelectedUnitObj() {
    if (!this.selectedUnitLoc) return null;
    return this.selectedUnitLoc.zone === 'bench' ? Engine.state.player.bench[this.selectedUnitLoc.index] : Engine.state.player.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col];
  },

  onBuyMarketCard(idx) {
    if (Engine.state.phase !== 'MARKET') return;
    Engine.saveSnapshot();
    const res = Engine.buyUnit(Engine.state.player, idx);
    if (!res.ok) { Engine.history.pop(); return; }
    this.benchMinimized = false;
    this.selectedUnitLoc = { zone: 'bench', index: Engine.state.player.bench.length - 1 };
    this.renderAll();
  },
  buySlot() {
    if (Engine.state.phase !== 'MARKET') return;
    Engine.saveSnapshot();
    if (!Engine.buySlot(Engine.state.player).ok) Engine.history.pop();
    this.renderAll();
  },
  rerollMarket() {
    if (Engine.state.phase !== 'MARKET') return;
    Engine.saveSnapshot();
    if (!Engine.rerollMarket(Engine.state.player).ok) Engine.history.pop();
    this.renderAll();
  },
  onBenchSlotClick(index) {
    if (!['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    if (this.selectedUnitLoc?.zone === 'bench' && this.selectedUnitLoc.index === index) this.selectedUnitLoc = null;
    else this.selectedUnitLoc = { zone: 'bench', index };
    this.renderAll();
  },
  onEmptyBenchSlotClick() {
    if (!['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    if (this.selectedUnitLoc?.zone === 'board') this.moveSelectedToBench();
  },
  onBoardSlotClick(row, col) {
    if (!['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    const pState = Engine.state.player, targetUnit = pState.board[row][col];
    if (!this.selectedUnitLoc) { if(targetUnit) this.selectedUnitLoc = { zone:'board', row, col }; this.renderAll(); return; }
    if (this.selectedUnitLoc.zone === 'board' && this.selectedUnitLoc.row === row && this.selectedUnitLoc.col === col) { this.selectedUnitLoc = null; this.renderAll(); return; }
    
    Engine.saveSnapshot();
    if (this.selectedUnitLoc.zone === 'bench') {
      const benchUnit = pState.bench[this.selectedUnitLoc.index];
      if (!targetUnit && Engine.getBoardCount(pState) >= pState.unlockedSlots) { Engine.history.pop(); this.setStatusBanner(`⚠️ Board limit reached.`); return; }
      pState.board[row][col] = benchUnit;
      if (!targetUnit) pState.bench.splice(this.selectedUnitLoc.index, 1); else pState.bench[this.selectedUnitLoc.index] = targetUnit;
    } else if (this.selectedUnitLoc.zone === 'board') {
      pState.board[row][col] = pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col];
      pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = targetUnit || null;
    }
    this.selectedUnitLoc = null; this.renderAll();
  },
  moveSelectedToBench() {
    if (!this.selectedUnitLoc || this.selectedUnitLoc.zone !== 'board') return;
    const pState = Engine.state.player;
    if (pState.bench.length >= 8) { this.setStatusBanner(`⚠️ Bench full!`); return; }
    Engine.saveSnapshot();
    pState.bench.push(pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col]);
    pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = null;
    this.selectedUnitLoc = null; this.renderAll();
  },
  sellSelectedUnit() {
    if (!this.selectedUnitLoc || !['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    Engine.saveSnapshot();
    Engine.sellUnit(Engine.state.player, this.selectedUnitLoc);
    this.selectedUnitLoc = null; this.renderAll();
  },
  triggerFusionPrompt() {
    const cands = Engine.getFusionCandidates(Engine.state.player);
    if (!cands.length) return;
    const unique = [...new Set(cands[0].items.map(i => i.unit.element))];
    if (unique.length === 1) {
      Engine.saveSnapshot();
      Engine.executeFusion(Engine.state.player, cands[0].cls, cands[0].star, unique[0]);
      this.selectedUnitLoc = null; this.renderAll(); return;
    }
    document.getElementById('fusion-element-choices').innerHTML = unique.map(el => `<button class="btn btn-primary el-${el}" onclick="UI.doFusion('${cands[0].cls}', ${cands[0].star}, '${el}')">${ELEMENT_ICONS[el]} ${el}</button>`).join('');
    this.toggleModal('fusion-modal', true);
  },
  doFusion(cls, star, element) {
    this.toggleModal('fusion-modal', false);
    Engine.saveSnapshot();
    Engine.executeFusion(Engine.state.player, cls, star, element);
    this.selectedUnitLoc = null; this.renderAll();
  },

  async startCombatPhase() {
    if (Engine.state.phase !== 'PREPARATION' || this.isAnimatingCombat) return;
    const pState = Engine.state.player;
    if (Engine.getBoardCount(pState) === 0 && pState.bench.length > 0) pState.board[pState.bench[0].role==='Ranged'?'back':'front'][0] = pState.bench.shift();
    
    // Lock in for battle
    BotAI.executeTurn();
    this.selectedUnitLoc = null; Engine.state.phase = 'COMBAT'; this.isAnimatingCombat = true;
    this.renderAll();

    const battleResult = Engine.simulateBattle();
    for (const entry of battleResult.log) {
      if (!this.isAnimatingCombat) return;
      if (entry.type === 'START') { this.setStatusBanner(entry.text); this.renderCombatSnapshot(entry.snapshot); await this.sleep(600); }
      else if (entry.type === 'WAVE') {
        this.setStatusBanner(entry.waveLabel);
        entry.events.forEach(ev => {
          this.animateUnitAction(ev.atkSide, ev.atkRow, ev.atkCol, ev.atkSide==='player'?'anim-attack-up':'anim-attack-down');
          this.animateUnitAction(ev.targetSide, ev.targetRow, ev.targetCol, 'anim-hit');
        });
        await this.sleep(450); this.renderCombatSnapshot(entry.snapshot); await this.sleep(450);
      }
      else if (entry.type === 'REVIVE' || entry.type === 'DEATH') { this.renderCombatSnapshot(entry.snapshot); await this.sleep(300); }
      else if (entry.type === 'END') {
        this.setStatusBanner(entry.outcome === 'PLAYER_WIN' ? `🏆 VICTORY!` : entry.outcome === 'BOT_WIN' ? `💀 DEFEAT!` : `🤝 TIE!`);
        await this.sleep(1400);
      }
    }

    Engine.resolveRoundOutcome(battleResult.outcome);
    this.isAnimatingCombat = false;
    if (Engine.state.phase === 'GAMEOVER') this.showGameOverModal();
    else { this.benchMinimized = true; this.renderAll(); }
  },

  renderCombatSnapshot(snapshot) {
    if (!snapshot) return;
    const renderSide = (units, side) => {
      ['front', 'back'].forEach(row => {
        for (let col=0; col<3; col++) {
          const slot = document.querySelector(`#${side==='player'?'player':'opp'}-${row}-row .board-slot[data-col="${col}"]`);
          if (!slot) continue; slot.innerHTML = '';
          const u = units.find(i => i.row===row && i.col===col);
          if (u) slot.appendChild(this.createUnitCardDOM(u, { ap:u.ap, hp:u.hp, maxHp:u.maxHp, dead:!u.alive }));
        }
      });
    };
    renderSide(snapshot.player, 'player'); renderSide(snapshot.bot, 'bot');
  },
  animateUnitAction(side, row, col, animClass) {
    const card = document.querySelector(`#${side==='player'?'player':'opp'}-${row}-row .board-slot[data-col="${col}"] .unit-card`);
    if (card) { card.classList.remove(animClass); void card.offsetWidth; card.classList.add(animClass); }
  },
  sleep(ms) { return new Promise(r => setTimeout(r, ms / this.playbackSpeed)); },
  showGameOverModal() {
    const pLosses = Engine.state.player.losses, bLosses = Engine.state.bot.losses;
    document.getElementById('gameover-title').textContent = (bLosses >= 6 && pLosses < 6) ? '🏆 VICTORY!' : '💀 DEFEAT';
    document.getElementById('gameover-subtitle').textContent = `Round ${Engine.state.round}.`;
    this.toggleModal('gameover-modal', true);
  },
  populateReferenceModal() { /* Setup identical to original */ }
};

window.addEventListener('DOMContentLoaded', () => UI.init());