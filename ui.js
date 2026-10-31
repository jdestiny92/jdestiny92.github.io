/* ==========================================================================
   UI.JS — Mobile Touch Controller, Pure Card Art & Cinematic Battle Player
   ========================================================================== */
const UI = {
  selectedUnitLoc: null, 
  playbackSpeed: 1,
  isAnimatingCombat: false,
  benchMinimized: true,

  init() { this.populateReferenceModal(); },

  getUnitImagePath(cls, star, element) {
    const clsName = cls.charAt(0).toUpperCase() + cls.slice(1); 
    let elName = element.charAt(0).toUpperCase() + element.slice(1);
    if (elName === 'Shadow') elName = 'Dark'; 
    return `assets/${clsName}/${elName}/${clsName}_${star}_star_${elName.toLowerCase()}.png`;
  },

  handleImageError(imgEl, cls, star) {
    imgEl.onerror = null;
    imgEl.src = `assets/${cls.toLowerCase()}_${star}.svg`;
  },

  startGame(difficulty) {
    this.selectedUnitLoc = null;
    this.isAnimatingCombat = false;
    this.benchMinimized = true;
    BotAI.initBotPersonality(difficulty);
    Engine.createNewGame(difficulty);
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('round-end-modal').classList.remove('active');
    document.getElementById('bot-label').textContent = difficulty === 'easy' ? 'EASY BOT' : 'MED BOT';
    this.setStatusBanner(`Round 1: Buy units from the Market`);
    this.renderAll();
  },

  returnToMenu() {
    this.isAnimatingCombat = false;
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('round-end-modal').classList.remove('active');
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
    if (Engine.state.phase === 'COMBAT' || Engine.state.phase === 'END' || Engine.state.phase === 'GAMEOVER') return;
    if (Engine.undo()) {
      this.selectedUnitLoc = null;
      this.setStatusBanner('↩️ Undid last action.');
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
      Engine.saveSnapshot();
      Engine.state.phase = 'PREPARATION';
      this.benchMinimized = false; // Expand bench for placement
      this.selectedUnitLoc = null;
      this.setStatusBanner(`Preparation: Place units from your Bench onto your Board`);
    } else if (Engine.state.phase === 'PREPARATION') {
      this.startCombatPhase();
    }
    this.renderAll();
  },

  proceedToNextRound() {
    this.toggleModal('round-end-modal', false);
    Engine.advanceToNextMarketRound();
    this.benchMinimized = true;
    this.selectedUnitLoc = null;
    this.setStatusBanner(`Round ${Engine.state.round}: Buy units from the Market`);
    this.renderAll();
  },

  renderAll() {
    const state = Engine.state;
    if (!state) return;

    document.body.className = `phase-${state.phase.toLowerCase()}`;
    const btnNext = document.getElementById('btn-next-phase');
    if (state.phase === 'MARKET') {
      btnNext.textContent = "➡️ Proceed to Preparation Phase";
      btnNext.style.display = 'block';
    } else if (state.phase === 'PREPARATION') {
      btnNext.textContent = "⚔️ BATTLE!";
      btnNext.style.display = 'block';
    } else {
      btnNext.style.display = 'none';
    }

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

    document.getElementById('player-board-title').textContent = `🛡️ Your Board (${Engine.getBoardCount(state.player)}/${state.player.unlockedSlots} Slots)`;
    document.getElementById('opp-board-title').textContent = `🤖 Bot Board (${Engine.getBoardCount(state.bot)}/${state.bot.unlockedSlots} Slots)`;
    document.getElementById('opp-gold-display').textContent = `🪙 ${state.bot.gold}`;
    document.getElementById('player-gold').textContent = state.player.gold;
    document.getElementById('bench-count').textContent = state.player.bench.length;
    document.getElementById('deck-counter').textContent = `Deck: ${state.deck.length}`;

    // Undo button state
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.disabled = Engine.history.length === 0;

    // +1 Slot button with explicit Gold cost
    const btnSlot = document.getElementById('btn-buy-slot');
    if (state.player.unlockedSlots >= 6) {
      btnSlot.disabled = true;
      btnSlot.textContent = `🔓 Max Slots (6/6)`;
    } else {
      const nextCost = SLOT_UNLOCK_COSTS[state.player.unlockedSlots - 1];
      btnSlot.disabled = state.player.gold < nextCost;
      btnSlot.textContent = `🔓 +1 Slot (${nextCost}G)`;
    }

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
    const marketEl = document.getElementById('market-cards');
    marketEl.innerHTML = '';
    Engine.state.market.forEach((unit, idx) => {
      const itemWrap = document.createElement('div');
      itemWrap.className = 'market-item-wrap';

      const slot = document.createElement('div');
      slot.className = 'market-slot';

      if (unit) {
        const card = this.createUnitCardDOM(unit, { ap: unit.baseAp, hp: unit.baseHp, isMarket: true });
        card.onclick = () => this.onBuyMarketCard(idx);
        slot.appendChild(card);

        const priceTag = document.createElement('div');
        priceTag.className = 'market-price-below';
        priceTag.textContent = '🪙 3G';
        priceTag.onclick = () => this.onBuyMarketCard(idx);

        itemWrap.appendChild(slot);
        itemWrap.appendChild(priceTag);
      } else {
        itemWrap.appendChild(slot);
      }
      marketEl.appendChild(itemWrap);
    });
  },

  // Pure character card with zero text/element overlays inside the card
  createUnitCardDOM(unit, opts = {}) {
    const card = document.createElement('div');
    card.className = `unit-card el-${unit.element} ${opts.isSelected ? 'selected' : ''} ${opts.canFuse ? 'can-fuse' : ''} ${opts.dead ? 'dead-unit' : ''} ${opts.stunned ? 'stunned-unit' : ''}`;
    const imgPath = this.getUnitImagePath(unit.cls, unit.star, unit.element);

    let innerHTML = `<div class="unit-art-wrap"><img src="${imgPath}" alt="${unit.cls}" onerror="UI.handleImageError(this, '${unit.cls}', ${unit.star})" /></div>`;
    
    if (opts.penaltyText) {
      innerHTML += `<div class="unit-role-warning" title="${opts.penaltyText}">⚠️</div>`;
    }

    if (!opts.isMarket) {
      const hpPct = opts.maxHp ? Math.max(0, Math.min(100, Math.round((opts.hp / opts.maxHp) * 100))) : 100;
      innerHTML += `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${hpPct}%"></div></div>`;
    }
    
    card.innerHTML = innerHTML;
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
    infoEl.textContent = `${unit.cls} (${unit.star}★ ${unit.element}) • ${unit.role}`;
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
    if (!res.ok) {
      Engine.history.pop();
      this.setStatusBanner(`⚠️ ${res.msg || 'Cannot buy unit'}`);
      return;
    }
    this.benchMinimized = false;
    this.selectedUnitLoc = { zone: 'bench', index: Engine.state.player.bench.length - 1 };
    this.setStatusBanner(`Bought ${res.unit.star}★ ${res.unit.element} ${res.unit.cls}!`);
    this.renderAll();
  },

  buySlot() {
    if (!['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    Engine.saveSnapshot();
    const res = Engine.buySlot(Engine.state.player);
    if (!res.ok) {
      Engine.history.pop();
      this.setStatusBanner(`⚠️ ${res.msg || 'Cannot unlock slot'}`);
      return;
    }
    this.setStatusBanner(`🔓 Unlocked Board Slot ${res.unlockedSlots}/6 (-${res.cost}G)!`);
    this.renderAll();
  },

  rerollMarket() {
    if (Engine.state.phase !== 'MARKET') return;
    Engine.saveSnapshot();
    const res = Engine.rerollMarket(Engine.state.player);
    if (!res.ok) {
      Engine.history.pop();
      this.setStatusBanner(`⚠️ ${res.msg || 'Need 2 Gold to reroll'}`);
      return;
    }
    this.setStatusBanner(`🎲 Rerolled Market (-2G)!`);
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
      if (!targetUnit && Engine.getBoardCount(pState) >= pState.unlockedSlots) {
        Engine.history.pop();
        this.setStatusBanner(`⚠️ Board limit reached (${pState.unlockedSlots}/${pState.unlockedSlots}). Unlock a slot first!`);
        return;
      }
      pState.board[row][col] = benchUnit;
      if (!targetUnit) pState.bench.splice(this.selectedUnitLoc.index, 1); else pState.bench[this.selectedUnitLoc.index] = targetUnit;
    } else if (this.selectedUnitLoc.zone === 'board') {
      pState.board[row][col] = pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col];
      pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = targetUnit || null;
    }
    this.selectedUnitLoc = null;
    this.renderAll();
  },

  moveSelectedToBench() {
    if (!this.selectedUnitLoc || this.selectedUnitLoc.zone !== 'board') return;
    const pState = Engine.state.player;
    if (pState.bench.length >= 8) { this.setStatusBanner(`⚠️ Bench full!`); return; }
    Engine.saveSnapshot();
    pState.bench.push(pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col]);
    pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = null;
    this.selectedUnitLoc = null;
    this.renderAll();
  },

  sellSelectedUnit() {
    if (!this.selectedUnitLoc || !['MARKET','PREPARATION'].includes(Engine.state.phase)) return;
    Engine.saveSnapshot();
    const res = Engine.sellUnit(Engine.state.player, this.selectedUnitLoc);
    if (res.ok) this.setStatusBanner(`💰 Sold ${res.unit.cls} for +${res.refund}G`);
    this.selectedUnitLoc = null;
    this.renderAll();
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
    this.selectedUnitLoc = null;
    this.renderAll();
  },

  // ==========================================================================
  // FULL CINEMATIC COMBAT PHASE PLAYBACK + END PHASE STEP
  // ==========================================================================
  async startCombatPhase() {
    if (Engine.state.phase !== 'PREPARATION' || this.isAnimatingCombat) return;
    const pState = Engine.state.player;
    if (Engine.getBoardCount(pState) === 0 && pState.bench.length > 0) {
      const u = pState.bench.shift();
      pState.board[u.role === 'Ranged' ? 'back' : 'front'][0] = u;
    }
    
    BotAI.executeTurn();
    this.selectedUnitLoc = null;
    Engine.state.phase = 'COMBAT';
    this.isAnimatingCombat = true;
    this.renderAll();

    const battleResult = Engine.simulateBattle();
    for (const entry of battleResult.log) {
      if (!this.isAnimatingCombat) return;

      if (entry.type === 'START') {
        this.setStatusBanner(entry.text);
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(650);
      } else if (entry.type === 'WAVE') {
        this.setStatusBanner(entry.waveLabel);
        entry.events.forEach(ev => {
          this.animateUnitAction(ev.atkSide, ev.atkRow, ev.atkCol, ev.atkSide === 'player' ? 'anim-attack-up' : 'anim-attack-down');
          this.animateUnitAction(ev.targetSide, ev.targetRow, ev.targetCol, 'anim-hit');
          if (ev.dodged) {
            this.spawnFloatingText(ev.targetSide, ev.targetRow, ev.targetCol, 'DODGE!', 'float-special');
          } else {
            this.spawnFloatingText(ev.targetSide, ev.targetRow, ev.targetCol, `-${ev.dmg}${ev.isCrit ? '⚡' : ''}`, 'float-dmg');
          }
          ev.splashTargets?.forEach(sp => {
            this.spawnFloatingText(sp.side, sp.row, sp.col, `-1 💥`, 'float-dmg');
          });
        });
        await this.sleep(480);
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(480);
      } else if (entry.type === 'HEAL') {
        entry.events.forEach(ev => {
          this.spawnFloatingText(ev.side, ev.row, ev.col, `+${ev.amount} ❤️`, 'float-heal');
        });
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(500);
      } else if (entry.type === 'REVIVE') {
        this.spawnFloatingText(entry.side, entry.row, entry.col, `REVIVED! ✨`, 'float-special');
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(550);
      } else if (entry.type === 'DEATH') {
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(300);
      } else if (entry.type === 'END') {
        const msg = entry.outcome === 'PLAYER_WIN' ? `🏆 VICTORY!` : entry.outcome === 'BOT_WIN' ? `💀 DEFEAT!` : `🤝 TIE!`;
        this.setStatusBanner(msg);
        await this.sleep(1100);
      }
    }

    const summary = Engine.applyBattleOutcome(battleResult.outcome, battleResult.pRemaining, battleResult.bRemaining);
    this.isAnimatingCombat = false;
    this.renderAll();

    if (Engine.state.phase === 'GAMEOVER') {
      this.showGameOverModal();
    } else {
      this.showRoundEndModal(summary);
    }
  },

  showRoundEndModal(summary) {
    document.getElementById('end-round-badge').textContent = `END OF ROUND ${Engine.state.round}`;
    const titleEl = document.getElementById('end-outcome-title');
    const subEl = document.getElementById('end-outcome-subtitle');
    const detailsEl = document.getElementById('end-summary-details');

    if (summary.outcome === 'PLAYER_WIN') {
      titleEl.textContent = '🏆 ROUND VICTORY!';
      subEl.textContent = 'You wiped out the enemy board!';
    } else if (summary.outcome === 'BOT_WIN') {
      titleEl.textContent = '💀 ROUND DEFEAT';
      subEl.textContent = 'Your board was wiped out.';
    } else {
      titleEl.textContent = '🤝 MUTUAL TIE';
      subEl.textContent = 'Both sides were destroyed simultaneously!';
    }

    const lossText = summary.outcome === 'PLAYER_WIN'
      ? 'Bot takes +1 Loss Token'
      : (summary.outcome === 'BOT_WIN' ? 'You take +1 Loss Token' : 'No Loss Tokens dealt');

    detailsEl.innerHTML = `
      <div class="end-summary-row"><span>Surviving Units:</span><strong>You: ${summary.pRemaining} | Bot: ${summary.bRemaining}</strong></div>
      <div class="end-summary-row"><span>Loss Penalty:</span><strong>${lossText}</strong></div>
      <div class="end-summary-row"><span>Your Gold Income:</span><strong style="color:#fbbf24;">+${summary.playerGoldEarned}G (Total: ${Engine.state.player.gold}G)</strong></div>
      <div class="end-summary-row"><span>Current Lives:</span><strong>You: ${6 - Engine.state.player.losses}/6 | Bot: ${6 - Engine.state.bot.losses}/6</strong></div>
    `;

    this.toggleModal('round-end-modal', true);
  },

  renderCombatSnapshot(snapshot) {
    if (!snapshot) return;
    const renderSide = (units, side) => {
      ['front', 'back'].forEach(row => {
        for (let col=0; col<3; col++) {
          const slot = document.querySelector(`#${side==='player'?'player':'opp'}-${row}-row .board-slot[data-col="${col}"]`);
          if (!slot) continue; slot.innerHTML = '';
          const u = units.find(i => i.row===row && i.col===col);
          if (u) slot.appendChild(this.createUnitCardDOM(u, { ap:u.ap, hp:u.hp, maxHp:u.maxHp, dead:!u.alive, stunned:u.stunned }));
        }
      });
    };
    renderSide(snapshot.player, 'player'); renderSide(snapshot.bot, 'bot');
  },

  getSlotElement(side, row, col) {
    return document.querySelector(`#${side==='player'?'player':'opp'}-${row}-row .board-slot[data-col="${col}"]`);
  },

  animateUnitAction(side, row, col, animClass) {
    const slotEl = this.getSlotElement(side, row, col);
    if (!slotEl) return;
    const card = slotEl.querySelector('.unit-card');
    if (card) { card.classList.remove(animClass); void card.offsetWidth; card.classList.add(animClass); }
  },

  spawnFloatingText(side, row, col, text, clsName) {
    const slotEl = this.getSlotElement(side, row, col);
    if (!slotEl) return;
    const pop = document.createElement('div');
    pop.className = `floating-text ${clsName}`;
    pop.textContent = text;
    slotEl.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms / this.playbackSpeed)); },

  showGameOverModal() {
    const pLosses = Engine.state.player.losses, bLosses = Engine.state.bot.losses;
    document.getElementById('gameover-title').textContent = (bLosses >= 6 && pLosses < 6) ? '🏆 MATCH VICTORY!' : '💀 MATCH DEFEAT';
    document.getElementById('gameover-subtitle').textContent = `Match ended in Round ${Engine.state.round}.`;
    this.toggleModal('gameover-modal', true);
  },

  populateReferenceModal() {
    const cGrid = document.getElementById('ref-class-synergies');
    const eGrid = document.getElementById('ref-element-synergies');
    if (!cGrid || !eGrid) return;

    cGrid.innerHTML = Object.entries(CLASS_SYNERGY_DESC).map(([cls, tiers]) => `
      <div class="ref-item">
        <strong>${UNIT_STATS[cls].icon} ${cls} (${UNIT_STATS[cls].role}):</strong>
        (2) ${tiers[2]} • (3) ${tiers[3]}
      </div>
    `).join('');

    eGrid.innerHTML = Object.entries(ELEMENT_SYNERGY_DESC).map(([el, tiers]) => `
      <div class="ref-item">
        <strong>${ELEMENT_ICONS[el]} ${el}:</strong>
        (2) ${tiers[2]} • (4) ${tiers[4]} • (6) ${tiers[6]}
      </div>
    `).join('');
  }
};

window.addEventListener('DOMContentLoaded', () => UI.init());
