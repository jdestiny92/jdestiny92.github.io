/* ==========================================================================
   UI.JS — Mobile Touch Controller, Asset Resolver & Cinematic Battle Player
   ========================================================================== */

const UI = {
  selectedUnitLoc: null, // { zone: 'bench', index } or { zone: 'board', row, col }
  playbackSpeed: 1,
  isAnimatingCombat: false,

  init() {
    this.populateReferenceModal();
  },

  // NEW DYNAMIC ASSET RESOLVER (Subfolder Structure)
  getUnitImagePath(cls, star, element) {
    // Standardize naming mapping
    const clsName = cls.charAt(0).toUpperCase() + cls.slice(1); // e.g., 'Archer'
    
    // Map element to specific subfolders based on user request ('Shadow' -> 'Dark' if necessary)
    // The rulebook elements are: 'Fire', 'Water', 'Earth', 'Air', 'Light', 'Shadow'
    let elName = element.charAt(0).toUpperCase() + element.slice(1);
    if (elName === 'Shadow') elName = 'Dark'; 
    
    // Construct the requested path format: assets/Class/Element/Class_X_star_element.png
    // Example: assets/Archer/Air/Archer_1_star_air.png
    const fileName = `${clsName}_${star}_star_${elName.toLowerCase()}.png`;
    return `assets/${clsName}/${elName}/${fileName}`;
  },

  handleImageError(imgEl, cls, star, element) {
    // If the element-specific version fails, try falling back to a generic SVG
    // (This helps if they haven't uploaded every element permutation yet)
    imgEl.onerror = null;
    imgEl.src = `assets/${cls.toLowerCase()}_${star}.svg`;
  },

  startGame(difficulty) {
    this.selectedUnitLoc = null;
    this.isAnimatingCombat = false;
    BotAI.initBotPersonality(difficulty);
    Engine.createNewGame(difficulty);

    // Let Bot take its Round 1 Market turn right away so player can scout or we can run it right before battle
    BotAI.executeTurn();

    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('bot-label').textContent = difficulty === 'easy' ? 'EASY BOT' : 'MED BOT';

    this.setStatusBanner(`Round 1 Market Phase — Buy units & place them on your Board!`);
    this.renderAll();
  },

  returnToMenu() {
    this.isAnimatingCombat = false;
    document.getElementById('gameover-modal').classList.remove('active');
    document.getElementById('main-menu').classList.add('active');
  },

  toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.add('active');
    else el.classList.remove('active');
  },

  setSpeed(mult) {
    this.playbackSpeed = mult;
    document.getElementById('speed-1x').classList.toggle('active', mult === 1);
    document.getElementById('speed-2x').classList.toggle('active', mult === 2);
  },

  setStatusBanner(msg) {
    const el = document.getElementById('combat-status-banner');
    if (el) el.textContent = msg;
  },

  // ==========================================================================
  // RENDERING ALL ZONES
  // ==========================================================================
  renderAll() {
    const state = Engine.state;
    if (!state) return;

    // Top HUD
    document.getElementById('hud-round').textContent = state.round;
    document.getElementById('hud-phase').textContent = state.phase;
    this.renderLossDots('player-losses', state.player.losses);
    this.renderLossDots('bot-losses', state.bot.losses);

    // Board titles & Economy
    const pBoardCount = Engine.getBoardCount(state.player);
    const bBoardCount = Engine.getBoardCount(state.bot);
    document.getElementById('player-board-title').textContent =
      `🛡️ Your Board (${pBoardCount}/${state.player.unlockedSlots} Slots Used)`;
    document.getElementById('opp-board-title').textContent =
      `🤖 Bot Board (${bBoardCount}/${state.bot.unlockedSlots} Slots Used)`;
    document.getElementById('opp-gold-display').textContent = `🪙 ${state.bot.gold}`;
    document.getElementById('deck-counter').textContent = `Deck: ${state.deck.length}`;

    document.getElementById('player-gold').textContent = state.player.gold;
    document.getElementById('bench-count').textContent = state.player.bench.length;

    // Slot unlock button
    const btnSlot = document.getElementById('btn-buy-slot');
    if (state.player.unlockedSlots >= 6) {
      btnSlot.disabled = true;
      btnSlot.innerHTML = `🔓 Max Slots (6/6)`;
    } else {
      const nextCost = SLOT_UNLOCK_COSTS[state.player.unlockedSlots - 1];
      btnSlot.disabled = state.player.gold < nextCost;
      btnSlot.innerHTML = `🔓 +1 Slot (${nextCost}G)`;
    }

    // Reroll button
    document.getElementById('btn-reroll').disabled = state.player.gold < 2;

    // Render Synergies
    this.renderSynergyBar('player-synergies', state.player, 'YOU');
    this.renderSynergyBar('bot-synergies', state.bot, 'BOT');

    // Render Boards
    this.renderBoardZone(state.player, 'player');
    this.renderBoardZone(state.bot, 'bot');

    // Render Bench & Market
    this.renderBench();
    this.renderMarket();
    this.renderActionToolbar();
  },

  renderLossDots(containerId, losses) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement('div');
      dot.className = 'skull-dot' + (i < losses ? ' lost' : '');
      container.appendChild(dot);
    }
  },

  renderSynergyBar(containerId, pState, prefix) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const { classCounts, elementCounts } = Engine.computeSynergies(pState);

    Object.entries(classCounts).forEach(([cls, count]) => {
      const active = count >= 2;
      const badge = document.createElement('span');
      badge.className = 'syn-badge' + (active ? ' active-syn' : '');
      badge.textContent = `${UNIT_STATS[cls].icon}${cls} ${count}`;
      container.appendChild(badge);
    });

    Object.entries(elementCounts).forEach(([el, count]) => {
      const active = count >= 2;
      const badge = document.createElement('span');
      badge.className = 'syn-badge' + (active ? ' active-syn' : '');
      badge.textContent = `${ELEMENT_ICONS[el]}${el} ${count}`;
      container.appendChild(badge);
    });
  },

  renderBoardZone(pState, side) {
    const fusionCandidates = side === 'player' ? Engine.getFusionCandidates(pState) : [];
    const fuseIds = new Set();
    fusionCandidates.forEach(c => c.items.forEach(i => fuseIds.add(i.unit.id)));

    ['front', 'back'].forEach(row => {
      for (let col = 0; col < 3; col++) {
        const selector = side === 'player'
          ? `#player-${row}-row .board-slot[data-col="${col}"]`
          : `#opp-${row}-row .board-slot[data-col="${col}"]`;
        const slotEl = document.querySelector(selector);
        if (!slotEl) continue;

        slotEl.innerHTML = '';
        const unit = pState.board[row][col];

        // Highlight valid drop targets when a player unit is selected
        if (side === 'player' && this.selectedUnitLoc && Engine.state.phase === 'MARKET') {
          slotEl.classList.add('slot-highlight');
        } else {
          slotEl.classList.remove('slot-highlight');
        }

        if (unit) {
          const eff = Engine.getEffectiveUnitStats(pState, unit, row);
          const isSelected = side === 'player' &&
            this.selectedUnitLoc &&
            this.selectedUnitLoc.zone === 'board' &&
            this.selectedUnitLoc.row === row &&
            this.selectedUnitLoc.col === col;

          const cardEl = this.createUnitCardDOM(unit, {
            ap: eff.ap,
            hp: eff.hp,
            maxHp: eff.hp,
            penaltyText: eff.penaltyText,
            isSelected,
            canFuse: fuseIds.has(unit.id)
          });
          slotEl.appendChild(cardEl);
        }
      }
    });
  },

  renderBench() {
    const benchEl = document.getElementById('player-bench');
    benchEl.innerHTML = '';
    const pState = Engine.state.player;
    const fusionCandidates = Engine.getFusionCandidates(pState);
    const fuseIds = new Set();
    fusionCandidates.forEach(c => c.items.forEach(i => fuseIds.add(i.unit.id)));

    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'bench-slot';
      const unit = pState.bench[i];
      if (unit) {
        const isSelected = this.selectedUnitLoc &&
          this.selectedUnitLoc.zone === 'bench' &&
          this.selectedUnitLoc.index === i;

        const cardEl = this.createUnitCardDOM(unit, {
          ap: unit.baseAp,
          hp: unit.baseHp,
          maxHp: unit.baseHp,
          isSelected,
          canFuse: fuseIds.has(unit.id)
        });
        slot.onclick = () => this.onBenchSlotClick(i);
        slot.appendChild(cardEl);
      } else {
        slot.onclick = () => this.onEmptyBenchSlotClick();
      }
      benchEl.appendChild(slot);
    }
  },

  renderMarket() {
    const marketEl = document.getElementById('market-cards');
    marketEl.innerHTML = '';
    const pState = Engine.state.player;

    Engine.state.market.forEach((unit, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'market-slot';
      if (unit) {
        const cardEl = this.createUnitCardDOM(unit, {
          ap: unit.baseAp,
          hp: unit.baseHp,
          maxHp: unit.baseHp,
          isMarket: true
        });
        cardEl.onclick = () => this.onBuyMarketCard(idx);
        wrap.appendChild(cardEl);
      }
      marketEl.appendChild(wrap);
    });
  },

  createUnitCardDOM(unit, opts = {}) {
    const card = document.createElement('div');
    card.className = `unit-card el-${unit.element}`;
    if (opts.isSelected) card.classList.add('selected');
    if (opts.canFuse) card.classList.add('can-fuse');
    if (opts.dead) card.classList.add('dead-unit');
    if (opts.stunned) card.classList.add('stunned-unit');

    const stars = '★'.repeat(unit.star);
    const elIcon = ELEMENT_ICONS[unit.element] || '';
    const imgPath = this.getUnitImagePath(unit.cls, unit.star, unit.element);

    const hpPct = opts.maxHp ? Math.max(0, Math.min(100, Math.round((opts.hp / opts.maxHp) * 100))) : 100;

    card.innerHTML = `
      <div class="unit-top">
        <span class="unit-stars">${stars}</span>
        <span class="unit-el-tag" title="${unit.element}">${elIcon}${unit.element.slice(0, 3)}</span>
      </div>
      <div class="unit-art-wrap">
        <img src="${imgPath}" alt="${unit.cls}" onerror="UI.handleImageError(this, '${unit.cls}', ${unit.star}, '${unit.element}')" />
      </div>
      ${opts.penaltyText ? `<div class="unit-role-warning" title="${opts.penaltyText}">⚠️</div>` : ''}
      <div class="unit-name">${unit.cls}</div>
      <div class="unit-bottom">
        <span class="stat-ap">⚔️${opts.ap}</span>
        <span class="stat-hp">❤️${opts.hp}</span>
      </div>
      ${opts.isMarket
        ? `<div class="market-card-cost">🪙 3G</div>`
        : `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${hpPct}%"></div></div>`
      }
    `;
    return card;
  },

  renderActionToolbar() {
    const infoEl = document.getElementById('selected-unit-info');
    const btnFuse = document.getElementById('btn-fuse');
    const btnToBench = document.getElementById('btn-to-bench');
    const btnSell = document.getElementById('btn-sell');

    const pState = Engine.state.player;
    const candidates = Engine.getFusionCandidates(pState);

    // Show Fuse button whenever ANY fusion is available!
    if (candidates.length > 0 && Engine.state.phase === 'MARKET') {
      const c = candidates[0];
      btnFuse.classList.remove('hidden');
      btnFuse.textContent = `✨ Fuse ${c.cls} (${c.star}★→${c.star + 1}★)`;
    } else {
      btnFuse.classList.add('hidden');
    }

    if (!this.selectedUnitLoc || Engine.state.phase !== 'MARKET') {
      infoEl.textContent = 'Tap any unit on your Bench or Board to place, swap, or sell';
      btnToBench.classList.add('hidden');
      btnSell.classList.add('hidden');
      return;
    }

    const unit = this.getSelectedUnitObj();
    if (!unit) {
      this.selectedUnitLoc = null;
      btnToBench.classList.add('hidden');
      btnSell.classList.add('hidden');
      return;
    }

    const refund = SELL_REFUND[unit.star] || 1;
    const preferredRow = unit.role === 'Melee' ? 'Front Row' : (unit.role === 'Ranged' ? 'Back Row' : 'Any Row');
    infoEl.textContent = `${unit.cls} (${unit.star}★ ${unit.element}) • Role: ${unit.role} (${preferredRow})`;

    btnSell.classList.remove('hidden');
    btnSell.textContent = `💰 Sell (+${refund}G)`;

    if (this.selectedUnitLoc.zone === 'board') {
      btnToBench.classList.remove('hidden');
    } else {
      btnToBench.classList.add('hidden');
    }
  },

  getSelectedUnitObj() {
    if (!this.selectedUnitLoc) return null;
    const pState = Engine.state.player;
    if (this.selectedUnitLoc.zone === 'bench') {
      return pState.bench[this.selectedUnitLoc.index] || null;
    }
    return pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] || null;
  },

  // ==========================================================================
  // INTERACTIVE MARKET & BOARD PLACEMENT ACTIONS
  // ==========================================================================
  onBuyMarketCard(marketIndex) {
    if (Engine.state.phase !== 'MARKET') return;
    const res = Engine.buyUnit(Engine.state.player, marketIndex);
    if (!res.ok) {
      this.setStatusBanner(`⚠️ ${res.msg}`);
      return;
    }
    // Auto-select newly bought unit on bench so player can tap a board slot immediately
    const newBenchIdx = Engine.state.player.bench.length - 1;
    this.selectedUnitLoc = { zone: 'bench', index: newBenchIdx };
    this.setStatusBanner(`Bought ${res.unit.star}★ ${res.unit.element} ${res.unit.cls}! Tap a Board slot to deploy.`);
    this.renderAll();
  },

  buySlot() {
    if (Engine.state.phase !== 'MARKET') return;
    const res = Engine.buySlot(Engine.state.player);
    if (!res.ok) {
      this.setStatusBanner(`⚠️ ${res.msg}`);
      return;
    }
    this.setStatusBanner(`🔓 Unlocked Board Slot ${res.unlockedSlots}/6!`);
    this.renderAll();
  },

  rerollMarket() {
    if (Engine.state.phase !== 'MARKET') return;
    const res = Engine.rerollMarket(Engine.state.player);
    if (!res.ok) {
      this.setStatusBanner(`⚠️ ${res.msg}`);
      return;
    }
    this.setStatusBanner(`🎲 Market rerolled with 5 new cards!`);
    this.renderAll();
  },

  onBenchSlotClick(index) {
    if (Engine.state.phase !== 'MARKET') return;
    if (this.selectedUnitLoc && this.selectedUnitLoc.zone === 'bench' && this.selectedUnitLoc.index === index) {
      this.selectedUnitLoc = null;
    } else {
      this.selectedUnitLoc = { zone: 'bench', index };
    }
    this.renderAll();
  },

  onEmptyBenchSlotClick() {
    if (Engine.state.phase !== 'MARKET') return;
    if (this.selectedUnitLoc && this.selectedUnitLoc.zone === 'board') {
      this.moveSelectedToBench();
    }
  },

  onBoardSlotClick(row, col) {
    if (Engine.state.phase !== 'MARKET') return;
    const pState = Engine.state.player;
    const targetUnit = pState.board[row][col];

    // If nothing is selected yet, select the unit on this board slot
    if (!this.selectedUnitLoc) {
      if (targetUnit) {
        this.selectedUnitLoc = { zone: 'board', row, col };
        this.renderAll();
      }
      return;
    }

    // If clicking the exact same board slot, deselect
    if (this.selectedUnitLoc.zone === 'board' &&
        this.selectedUnitLoc.row === row &&
        this.selectedUnitLoc.col === col) {
      this.selectedUnitLoc = null;
      this.renderAll();
      return;
    }

    // Moving from Bench -> Board
    if (this.selectedUnitLoc.zone === 'bench') {
      const benchUnit = pState.bench[this.selectedUnitLoc.index];
      if (!benchUnit) return;

      if (!targetUnit) {
        // Placing into an empty board slot: check unlockedSlots limit
        const currentBoardCount = Engine.getBoardCount(pState);
        if (currentBoardCount >= pState.unlockedSlots) {
          this.setStatusBanner(`⚠️ Board limit reached (${pState.unlockedSlots}/${pState.unlockedSlots}). Unlock a slot or swap with an existing unit!`);
          return;
        }
        pState.board[row][col] = benchUnit;
        pState.bench.splice(this.selectedUnitLoc.index, 1);
      } else {
        // Swap bench unit with board unit
        pState.board[row][col] = benchUnit;
        pState.bench[this.selectedUnitLoc.index] = targetUnit;
      }
      this.selectedUnitLoc = null;
      this.checkPlacementWarning(benchUnit, row);
      this.renderAll();
      return;
    }

    // Moving from Board -> Board (reposition or swap)
    if (this.selectedUnitLoc.zone === 'board') {
      const fromUnit = pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col];
      pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = targetUnit || null;
      pState.board[row][col] = fromUnit;
      this.selectedUnitLoc = null;
      this.checkPlacementWarning(fromUnit, row);
      this.renderAll();
    }
  },

  checkPlacementWarning(unit, row) {
    if (unit.role === 'Melee' && row === 'back') {
      this.setStatusBanner(`⚠️ ${unit.cls} is Melee — suffers -1 HP penalty in the Back Row!`);
    } else if (unit.role === 'Ranged' && row === 'front') {
      this.setStatusBanner(`⚠️ ${unit.cls} is Ranged — suffers -1 AP penalty in the Front Row!`);
    } else {
      this.setStatusBanner(`Deployed ${unit.cls} to ${row.toUpperCase()} row.`);
    }
  },

  moveSelectedToBench() {
    if (!this.selectedUnitLoc || this.selectedUnitLoc.zone !== 'board') return;
    const pState = Engine.state.player;
    if (pState.bench.length >= 8) {
      this.setStatusBanner(`⚠️ Bench is full (8/8)!`);
      return;
    }
    const unit = pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col];
    if (!unit) return;
    pState.board[this.selectedUnitLoc.row][this.selectedUnitLoc.col] = null;
    pState.bench.push(unit);
    this.selectedUnitLoc = null;
    this.renderAll();
  },

  sellSelectedUnit() {
    if (!this.selectedUnitLoc || Engine.state.phase !== 'MARKET') return;
    const res = Engine.sellUnit(Engine.state.player, this.selectedUnitLoc);
    if (res.ok) {
      this.setStatusBanner(`💰 Sold ${res.unit.star}★ ${res.unit.cls} for +${res.refund} Gold.`);
      this.selectedUnitLoc = null;
      this.renderAll();
    }
  },

  // ==========================================================================
  // FUSION ELEMENT SELECTION MODAL
  // ==========================================================================
  triggerFusionPrompt() {
    const pState = Engine.state.player;
    const candidates = Engine.getFusionCandidates(pState);
    if (candidates.length === 0) return;

    const cand = candidates[0];
    const uniqueElements = [...new Set(cand.items.map(i => i.unit.element))];

    // If all fused units share the same Element, fuse immediately
    if (uniqueElements.length === 1) {
      const res = Engine.executeFusion(pState, cand.cls, cand.star, uniqueElements[0]);
      if (res.ok) {
        this.selectedUnitLoc = null;
        this.setStatusBanner(`✨ Fused ${res.newUnit.star}★ ${res.newUnit.element} ${res.newUnit.cls}!`);
        this.renderAll();
      }
      return;
    }

    // Otherwise, let player choose which Element to keep per Rulebook
    document.getElementById('fusion-title').textContent =
      `Fuse ${cand.needed}x ${cand.star}★ ${cand.cls} → ${cand.star + 1}★!`;
    const grid = document.getElementById('fusion-element-choices');
    grid.innerHTML = '';

    uniqueElements.forEach(el => {
      const btn = document.createElement('button');
      btn.className = `btn btn-primary el-${el}`;
      btn.style.width = 'auto';
      btn.style.minWidth = '110px';
      btn.innerHTML = `<span>${ELEMENT_ICONS[el]} ${el}</span>`;
      btn.onclick = () => {
        this.toggleModal('fusion-modal', false);
        const res = Engine.executeFusion(pState, cand.cls, cand.star, el);
        if (res.ok) {
          this.selectedUnitLoc = null;
          this.setStatusBanner(`✨ Upgraded to ${res.newUnit.star}★ ${res.newUnit.element} ${res.newUnit.cls}!`);
          this.renderAll();
        }
      };
      grid.appendChild(btn);
    });

    this.toggleModal('fusion-modal', true);
  },

  // ==========================================================================
  // CINEMATIC COMBAT PHASE PLAYBACK
  // ==========================================================================
  async startCombatPhase() {
    if (Engine.state.phase !== 'MARKET' || this.isAnimatingCombat) return;

    // Auto-deploy a unit from bench if player forgot to put any unit on board
    const pState = Engine.state.player;
    if (Engine.getBoardCount(pState) === 0 && pState.bench.length > 0) {
      const u = pState.bench.shift();
      const row = u.role === 'Ranged' ? 'back' : 'front';
      pState.board[row][0] = u;
    }

    this.selectedUnitLoc = null;
    Engine.state.phase = 'COMBAT';
    this.isAnimatingCombat = true;

    // Switch bottom Market console to Combat Feed drawer
    document.getElementById('action-console').classList.add('hidden');
    document.getElementById('combat-console').classList.remove('hidden');
    const logList = document.getElementById('combat-log-list');
    logList.innerHTML = '';

    this.renderAll();

    // Run deterministic battle engine
    const battleResult = Engine.simulateBattle();

    // Play each event in the battle log cinematically
    for (const entry of battleResult.log) {
      if (!this.isAnimatingCombat) return;

      if (entry.type === 'START') {
        this.appendCombatLog(entry.text, 'log-header');
        this.setStatusBanner(entry.text);
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(600);
      } else if (entry.type === 'WAVE') {
        this.setStatusBanner(entry.waveLabel);
        this.appendCombatLog(`--- ${entry.waveLabel} ---`, 'log-header');

        // Trigger attack lunge animations & floating damage popups simultaneously
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
          this.appendCombatLog(ev.text, ev.atkSide === 'player' ? 'log-player' : 'log-bot');
        });

        await this.sleep(450);
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(450);
      } else if (entry.type === 'HEAL') {
        entry.events.forEach(ev => {
          this.spawnFloatingText(ev.side, ev.row, ev.col, `+${ev.amount} ❤️`, 'float-heal');
          this.appendCombatLog(ev.text, 'log-heal');
        });
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(500);
      } else if (entry.type === 'REVIVE') {
        this.spawnFloatingText(entry.side, entry.row, entry.col, `REVIVED! ✨`, 'float-special');
        this.appendCombatLog(entry.text, 'log-heal');
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(550);
      } else if (entry.type === 'DEATH') {
        this.appendCombatLog(entry.text, 'log-header');
        this.renderCombatSnapshot(entry.snapshot);
        await this.sleep(280);
      } else if (entry.type === 'END') {
        let bannerMsg = '';
        if (entry.outcome === 'PLAYER_WIN') {
          bannerMsg = `🏆 VICTORY! Bot takes 1 Loss Token. You earn +5 Gold (+3 Base, +2 Win)!`;
        } else if (entry.outcome === 'BOT_WIN') {
          bannerMsg = `💀 DEFEAT! You take 1 Loss Token. You earn +3 Base Gold.`;
        } else {
          bannerMsg = `🤝 MUTUAL DESTRUCTION (TIE)! No Loss Tokens dealt.`;
        }
        this.setStatusBanner(bannerMsg);
        this.appendCombatLog(bannerMsg, 'log-header');
        await this.sleep(1400);
      }
    }

    // Apply end-of-round economy & check for 6 Loss Tokens
    Engine.resolveRoundOutcome(battleResult.outcome);
    this.isAnimatingCombat = false;

    if (Engine.state.phase === 'GAMEOVER') {
      this.showGameOverModal();
      return;
    }

    // Bot executes its Market turn for the new round
    BotAI.executeTurn();

    // Restore Market Console
    document.getElementById('combat-console').classList.add('hidden');
    document.getElementById('action-console').classList.remove('hidden');
    this.renderAll();
  },

  renderCombatSnapshot(snapshot) {
    if (!snapshot) return;
    const renderSide = (units, side) => {
      ['front', 'back'].forEach(row => {
        for (let col = 0; col < 3; col++) {
          const selector = side === 'player'
            ? `#player-${row}-row .board-slot[data-col="${col}"]`
            : `#opp-${row}-row .board-slot[data-col="${col}"]`;
          const slotEl = document.querySelector(selector);
          if (!slotEl) continue;
          slotEl.innerHTML = '';

          const u = units.find(item => item.row === row && item.col === col);
          if (u) {
            const cardEl = this.createUnitCardDOM(u, {
              ap: u.ap,
              hp: u.hp,
              maxHp: u.maxHp,
              dead: !u.alive,
              stunned: u.stunned
            });
            slotEl.appendChild(cardEl);
          }
        }
      });
    };

    renderSide(snapshot.player, 'player');
    renderSide(snapshot.bot, 'bot');
  },

  getSlotElement(side, row, col) {
    const selector = side === 'player'
      ? `#player-${row}-row .board-slot[data-col="${col}"]`
      : `#opp-${row}-row .board-slot[data-col="${col}"]`;
    return document.querySelector(selector);
  },

  animateUnitAction(side, row, col, animClass) {
    const slotEl = this.getSlotElement(side, row, col);
    if (!slotEl) return;
    const card = slotEl.querySelector('.unit-card');
    if (!card) return;
    card.classList.remove(animClass);
    void card.offsetWidth; // force reflow
    card.classList.add(animClass);
  },

  spawnFloatingText(side, row, col, text, clsName) {
    const slotEl = this.getSlotElement(side, row, col);
    if (!slotEl) return;
    const pop = document.createElement('div');
    pop.className = `floating-text ${clsName}`;
    pop.textContent = text;
    slotEl.appendChild(pop);
    setTimeout(() => pop.remove(), 750);
  },

  appendCombatLog(text, clsName = '') {
    const list = document.getElementById('combat-log-list');
    if (!list) return;
    const item = document.createElement('div');
    item.className = `log-entry ${clsName}`;
    item.textContent = text;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms / this.playbackSpeed));
  },

  showGameOverModal() {
    const pLosses = Engine.state.player.losses;
    const bLosses = Engine.state.bot.losses;
    const titleEl = document.getElementById('gameover-title');
    const subEl = document.getElementById('gameover-subtitle');

    if (bLosses >= 6 && pLosses < 6) {
      titleEl.textContent = '🏆 VICTORY!';
      subEl.textContent = `You eliminated the Bot in Round ${Engine.state.round} (${6 - pLosses} lives remaining)!`;
    } else {
      titleEl.textContent = '💀 DEFEAT';
      subEl.textContent = `You reached 6 Loss Tokens in Round ${Engine.state.round}.`;
    }
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
