(async () => {
  // Load Socket.IO
  if (!window.io) {
    const s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    await new Promise(r => { s.onload = r; document.head.appendChild(s); });
  }

  const DEMO_START_BALANCE = 1.0;
  const BET_AMOUNTS = [0.001, 0.01, 0.1, 1.0];
  
  // Expanded prediction categories with scaled odds
  const PREDICTIONS = {
    // Timing predictions
    'INSTANT_RUG': { label: '⚡ Instant Rug (0-5 ticks)', odds: 12.0, check: (peak, ticks) => ticks <= 5 },
    'VERY_EARLY_RUG': { label: '💀 Very Early (6-15 ticks)', odds: 6.5, check: (peak, ticks) => ticks > 5 && ticks <= 15 },
    'EARLY_RUG': { label: '🔴 Early Rug (16-30 ticks)', odds: 3.8, check: (peak, ticks) => ticks > 15 && ticks <= 30 },
    'MID_EARLY_RUG': { label: '🟠 Mid-Early (31-60 ticks)', odds: 2.9, check: (peak, ticks) => ticks > 30 && ticks <= 60 },
    'MID_RUG': { label: '🟡 Mid Rug (61-100 ticks)', odds: 2.4, check: (peak, ticks) => ticks > 60 && ticks <= 100 },
    'MID_LATE_RUG': { label: '🟢 Mid-Late (101-150 ticks)', odds: 3.2, check: (peak, ticks) => ticks > 100 && ticks <= 150 },
    'LATE_RUG': { label: '🔵 Late Rug (151-200 ticks)', odds: 4.5, check: (peak, ticks) => ticks > 150 && ticks <= 200 },
    'VERY_LATE': { label: '🟣 Very Late (201-300 ticks)', odds: 7.5, check: (peak, ticks) => ticks > 200 && ticks <= 300 },
    'MOON': { label: '🚀 Moon Shot (300+ ticks)', odds: 15.0, check: (peak, ticks) => ticks > 300 },
    
    // Multiplier predictions - expanded
    'MICRO_MULTI': { label: '🔻 Micro (<1.5x)', odds: 8.0, check: (peak, ticks) => peak < 1.5 },
    'LOW_MULTI': { label: '📉 Low (1.5x-2.5x)', odds: 3.5, check: (peak, ticks) => peak >= 1.5 && peak < 2.5 },
    'MED_LOW_MULTI': { label: '📊 Med-Low (2.5x-4x)', odds: 2.8, check: (peak, ticks) => peak >= 2.5 && peak < 4 },
    'MED_MULTI': { label: '📈 Medium (4x-7x)', odds: 2.6, check: (peak, ticks) => peak >= 4 && peak < 7 },
    'MED_HIGH_MULTI': { label: '🎯 Med-High (7x-12x)', odds: 3.4, check: (peak, ticks) => peak >= 7 && peak < 12 },
    'HIGH_MULTI': { label: '🔥 High (12x-20x)', odds: 5.5, check: (peak, ticks) => peak >= 12 && peak < 20 },
    'VERY_HIGH_MULTI': { label: '💎 Very High (20x-35x)', odds: 9.0, check: (peak, ticks) => peak >= 20 && peak < 35 },
    'MEGA_MULTI': { label: '⭐ Mega (35x-50x)', odds: 14.0, check: (peak, ticks) => peak >= 35 && peak < 50 },
    'ULTRA_MULTI': { label: '👑 Ultra (50x-100x)', odds: 25.0, check: (peak, ticks) => peak >= 50 && peak < 100 },
    'LEGENDARY': { label: '🌟 Legendary (100x+)', odds: 50.0, check: (peak, ticks) => peak >= 100 },
    
    // Combo predictions
    'QUICK_PROFIT': { label: '⚡💰 Quick Profit (<30 ticks & >3x)', odds: 5.5, check: (peak, ticks) => ticks < 30 && peak > 3 },
    'STEADY_GRIND': { label: '🐌📈 Steady Grind (50-150 ticks & 3-10x)', odds: 3.8, check: (peak, ticks) => ticks >= 50 && ticks <= 150 && peak >= 3 && peak < 10 },
    'PATIENCE_PAYS': { label: '⏰💎 Patience Pays (150+ ticks & 10x+)', odds: 12.0, check: (peak, ticks) => ticks > 150 && peak >= 10 },
    'GRINDER_CHART': { label: '🐌💀 Grinder Death (<1.5x any time)', odds: 7.0, check: (peak, ticks) => peak < 1.5 },
  };

  const state = {
    balance: DEMO_START_BALANCE,
    currentGameId: null,
    gameActive: false,
    currentTick: 0,
    currentMultiplier: 1,
    peakMultiplier: 1,
    activeBets: [],
    betHistory: [],
    roundHistory: [],
    bettingOpen: true,
    minimized: false,
    scale: parseFloat(localStorage.getItem('predictionsScale') || '1.0'),
    totalProfit: 0,
    totalWagered: 0,
    wins: 0,
    losses: 0,
    selectedAmount: 0.01,
    activeTab: 'bet',
    lastRoundResult: null
  };

  function placeBet(predictionType) {
    if (!state.bettingOpen) {
      showNotification('❌ Betting closed for this round!', '#f00');
      return;
    }

    if (state.balance < state.selectedAmount) {
      showNotification('❌ Insufficient balance!', '#ff0');
      return;
    }

    const prediction = PREDICTIONS[predictionType];
    if (!prediction) return;

    state.balance -= state.selectedAmount;
    state.totalWagered += state.selectedAmount;

    const bet = {
      type: predictionType,
      amount: state.selectedAmount,
      odds: prediction.odds,
      potentialWin: state.selectedAmount * prediction.odds,
      gameId: state.currentGameId,
      timestamp: Date.now(),
      isWinning: false
    };

    state.activeBets.push(bet);
    
    showNotification(`✅ Bet placed: ${state.selectedAmount} SOL @ ${prediction.odds}x`, '#0f0');
    updateDashboard();
    updateLiveAlertBox();
  }

  function checkActiveBetsStatus() {
    // Update active bets to show if they're currently winning or losing
    state.activeBets.forEach(bet => {
      const prediction = PREDICTIONS[bet.type];
      bet.isWinning = prediction.check(state.peakMultiplier, state.currentTick);
    });
    updateLiveAlertBox();
  }

  function resolveBets(peakMultiplier, totalTicks) {
    let totalWon = 0;
    let totalLost = 0;
    let wonBets = [];
    let lostBets = [];

    state.activeBets.forEach(bet => {
      const prediction = PREDICTIONS[bet.type];
      const won = prediction.check(peakMultiplier, totalTicks);

      const result = {
        ...bet,
        won,
        peakMultiplier,
        totalTicks,
        payout: won ? bet.potentialWin : 0,
        profit: won ? bet.potentialWin - bet.amount : -bet.amount,
        timestamp: Date.now()
      };

      if (won) {
        state.balance += bet.potentialWin;
        totalWon += bet.potentialWin;
        state.wins++;
        state.totalProfit += result.profit;
        wonBets.push(result);
      } else {
        totalLost += bet.amount;
        state.losses++;
        state.totalProfit += result.profit;
        lostBets.push(result);
      }

      state.betHistory.unshift(result);
    });

    if (state.betHistory.length > 50) {
      state.betHistory = state.betHistory.slice(0, 50);
    }

    // Store last round result
    state.lastRoundResult = {
      won: totalWon > 0,
      totalWon,
      totalLost,
      wonBets,
      lostBets,
      peakMultiplier,
      totalTicks
    };

    // Show result notification
    if (wonBets.length > 0 && lostBets.length > 0) {
      showBigAlert(`🎰 MIXED RESULTS!\n✅ Won: ${totalWon.toFixed(4)} SOL\n❌ Lost: ${totalLost.toFixed(4)} SOL\nNet: ${(totalWon - totalLost).toFixed(4)} SOL`, totalWon > totalLost ? '#0f0' : '#f00');
    } else if (totalWon > 0) {
      showBigAlert(`🎉 ALL BETS WON!\n💰 +${totalWon.toFixed(4)} SOL\nProfit: +${(totalWon - state.activeBets.reduce((sum, b) => sum + b.amount, 0)).toFixed(4)} SOL`, '#0f0');
    } else if (totalLost > 0) {
      showBigAlert(`💀 ALL BETS LOST\n❌ -${totalLost.toFixed(4)} SOL\nBetter luck next time!`, '#f00');
    }

    state.activeBets = [];
    updateDashboard();
    updateLiveAlertBox();
  }

  function showNotification(message, color) {
    const notif = document.createElement('div');
    Object.assign(notif.style, {
      position: 'fixed',
      left: '50%',
      top: '20px',
      transform: 'translateX(-50%)',
      background: color === '#0f0' ? 'rgba(0,255,0,0.95)' : color === '#f00' ? 'rgba(255,0,0,0.95)' : 'rgba(255,255,0,0.95)',
      color: '#000',
      padding: '15px 30px',
      fontSize: '16px',
      fontWeight: 'bold',
      border: `3px solid ${color}`,
      borderRadius: '10px',
      zIndex: 10000000,
      boxShadow: `0 0 30px ${color}`
    });
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.remove(), 3000);
  }

  function showBigAlert(message, color) {
    const alert = document.createElement('div');
    Object.assign(alert.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.95)',
      color: color,
      padding: '40px 60px',
      fontSize: '24px',
      fontWeight: 'bold',
      border: `6px solid ${color}`,
      borderRadius: '20px',
      zIndex: 10000001,
      boxShadow: `0 0 100px ${color}`,
      textAlign: 'center',
      whiteSpace: 'pre-line',
      fontFamily: 'Courier New, monospace'
    });
    alert.innerHTML = message;
    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 5000);
  }

  // Live alert box
  const liveAlertBox = document.createElement('div');
  const savedAlertPos = JSON.parse(localStorage.getItem('liveAlertPosition') || '{"x":20,"y":80}');
  
  Object.assign(liveAlertBox.style, {
    position: 'fixed',
    left: savedAlertPos.x + 'px',
    top: savedAlertPos.y + 'px',
    background: 'rgba(0,0,20,0.95)',
    color: '#0ff',
    padding: '15px',
    fontSize: '13px',
    fontWeight: 'bold',
    border: '3px solid #f0f',
    borderRadius: '12px',
    zIndex: 9999997,
    minWidth: '300px',
    maxWidth: '400px',
    fontFamily: 'Courier New, monospace',
    display: 'none',
    cursor: 'move'
  });
  liveAlertBox.id = 'liveAlertBox';
  document.body.appendChild(liveAlertBox);

  // Make live alert draggable
  let alertDragging = false;
  let alertStartX, alertStartY, alertPosX, alertPosY;

  liveAlertBox.addEventListener('mousedown', (e) => {
    alertDragging = true;
    alertStartX = e.clientX;
    alertStartY = e.clientY;
    alertPosX = liveAlertBox.offsetLeft;
    alertPosY = liveAlertBox.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!alertDragging) return;
    const dx = e.clientX - alertStartX;
    const dy = e.clientY - alertStartY;
    liveAlertBox.style.left = (alertPosX + dx) + 'px';
    liveAlertBox.style.top = (alertPosY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (alertDragging) {
      localStorage.setItem('liveAlertPosition', JSON.stringify({
        x: liveAlertBox.offsetLeft,
        y: liveAlertBox.offsetTop
      }));
    }
    alertDragging = false;
  });

  function updateLiveAlertBox() {
    if (state.activeBets.length === 0) {
      liveAlertBox.style.display = 'none';
      return;
    }

    liveAlertBox.style.display = 'block';

    const content = state.activeBets.map(bet => {
      const prediction = PREDICTIONS[bet.type];
      const bgColor = bet.isWinning ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)';
      const borderColor = bet.isWinning ? '#0f0' : '#f00';
      const statusIcon = bet.isWinning ? '✅' : '❌';
      const statusText = bet.isWinning ? 'WINNING' : 'LOSING';
      
      return `
        <div style="background:${bgColor};padding:10px;margin-bottom:8px;border:2px solid ${borderColor};border-radius:8px;transition:all 0.3s ease;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="color:${borderColor};font-size:14px;font-weight:bold;">${statusIcon} ${statusText}</span>
            <span style="color:#ff0;font-size:12px;">${bet.odds}x</span>
          </div>
          <div style="color:#fff;font-size:11px;margin-bottom:4px;">${prediction.label}</div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">
            <span>Stake: ${bet.amount.toFixed(4)} SOL</span>
            <span style="color:${borderColor};">Win: ${bet.potentialWin.toFixed(4)} SOL</span>
          </div>
        </div>
      `;
    }).join('');

    liveAlertBox.innerHTML = `
      <div style="color:#f0f;font-size:16px;margin-bottom:12px;text-align:center;text-shadow:0 0 10px #f0f;">
        🎯 ACTIVE BETS (${state.activeBets.length})
      </div>
      ${content}
      <div style="margin-top:10px;padding-top:10px;border-top:2px solid #444;font-size:10px;color:#888;text-align:center;">
        Current: ${state.currentMultiplier.toFixed(3)}x @ ${state.currentTick} ticks
      </div>
    `;
  }

  // Create Dashboard
  const dash = document.createElement('div');
  const savedSize = JSON.parse(localStorage.getItem('predictionsSize') || '{"width":650,"height":750}');
  const centerX = (window.innerWidth - savedSize.width * state.scale) / 2;
  const centerY = (window.innerHeight - savedSize.height * state.scale) / 2;
  const savedPos = { x: Math.max(0, centerX), y: Math.max(0, centerY) };

  Object.assign(dash.style, {
    position: 'fixed',
    left: savedPos.x + 'px',
    top: savedPos.y + 'px',
    width: savedSize.width + 'px',
    height: savedSize.height + 'px',
    background: 'rgba(10,0,20,0.98)',
    color: '#0ff',
    fontFamily: 'Courier New, monospace',
    fontSize: '12px',
    border: '4px solid #f0f',
    borderRadius: '12px',
    zIndex: 999999,
    overflow: 'hidden',
    transform: `scale(${state.scale})`,
    transformOrigin: 'top left'
  });

  dash.innerHTML = `
    <div id="dragHandle" style="background:rgba(255,0,255,0.3);padding:12px;cursor:move;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f0f;">
      <div style="color:#f0f;font-size:18px;font-weight:bold;text-shadow:0 0 15px #f0f;">🎲 PREDICTIONS MARKET</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="color:#888;font-size:10px;">Scale:</span>
          <input type="range" id="scaleSlider" min="50" max="150" value="${state.scale * 100}" step="5" style="width:80px;cursor:pointer;" />
          <span id="scaleValue" style="color:#f0f;font-size:11px;min-width:35px;">${(state.scale * 100).toFixed(0)}%</span>
        </div>
        <button id="minimizeBtn" style="background:#ff0;color:#000;border:none;padding:6px 12px;cursor:pointer;font-weight:bold;border-radius:4px;">−</button>
      </div>
    </div>

    <div style="background:rgba(0,0,0,0.8);padding:12px;border-bottom:2px solid #f0f;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;">
        <div>
          <div style="color:#888;font-size:10px;">BALANCE</div>
          <div style="color:#0f0;font-size:20px;font-weight:bold;" id="balanceDisplay">${state.balance.toFixed(4)}</div>
        </div>
        <div>
          <div style="color:#888;font-size:10px;">PROFIT</div>
          <div style="color:${state.totalProfit >= 0 ? '#0f0' : '#f00'};font-size:20px;font-weight:bold;" id="profitDisplay">${state.totalProfit >= 0 ? '+' : ''}${state.totalProfit.toFixed(4)}</div>
        </div>
        <div>
          <div style="color:#888;font-size:10px;">W/L</div>
          <div style="color:#ff0;font-size:20px;font-weight:bold;" id="wlDisplay">${state.wins}/${state.losses}</div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:5px;padding:8px;background:rgba(0,0,0,0.5);border-bottom:2px solid #f0f;">
      <button class="tab-btn" data-tab="bet" style="flex:1;background:#f0f;color:#000;border:none;padding:8px;cursor:pointer;font-weight:bold;border-radius:4px;">BET</button>
      <button class="tab-btn" data-tab="history" style="flex:1;background:#333;color:#f0f;border:none;padding:8px;cursor:pointer;font-weight:bold;border-radius:4px;">HISTORY</button>
      <button class="tab-btn" data-tab="stats" style="flex:1;background:#333;color:#f0f;border:none;padding:8px;cursor:pointer;font-weight:bold;border-radius:4px;">STATS</button>
    </div>

    <div id="mainContent" style="padding:12px;height:calc(100% - 180px);overflow-y:auto;">
      <div id="betTab" style="display:block;">
        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid ${state.bettingOpen ? '#0f0' : '#f00'};margin-bottom:12px;text-align:center;">
          <div style="color:${state.bettingOpen ? '#0f0' : '#f00'};font-size:18px;font-weight:bold;" id="bettingStatus">
            ${state.bettingOpen ? '✅ BETTING OPEN' : '🔒 BETTING CLOSED'}
          </div>
          <div style="color:#888;font-size:11px;margin-top:4px;" id="gameStatus">Waiting for game...</div>
        </div>

        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #0ff;margin-bottom:12px;">
          <div style="color:#0ff;font-size:14px;font-weight:bold;margin-bottom:10px;">BET AMOUNT</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;" id="betAmounts"></div>
        </div>

        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #f0f;margin-bottom:12px;">
          <div style="color:#f0f;font-size:14px;font-weight:bold;margin-bottom:10px;">⏱️ TIMING BETS</div>
          <div style="display:grid;grid-template-columns:1fr;gap:6px;" id="timingBets"></div>
        </div>

        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #ff0;margin-bottom:12px;">
          <div style="color:#ff0;font-size:14px;font-weight:bold;margin-bottom:10px;">📊 MULTIPLIER BETS</div>
          <div style="display:grid;grid-template-columns:1fr;gap:6px;" id="multiplierBets"></div>
        </div>

        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #0f0;">
          <div style="color:#0f0;font-size:14px;font-weight:bold;margin-bottom:10px;">🎯 COMBO BETS</div>
          <div style="display:grid;grid-template-columns:1fr;gap:6px;" id="comboBets"></div>
        </div>
      </div>

      <div id="historyTab" style="display:none;">
        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #f0f;">
          <div style="color:#f0f;font-size:14px;font-weight:bold;margin-bottom:10px;">📜 BET HISTORY</div>
          <div id="historyList" style="max-height:600px;overflow-y:auto;"></div>
        </div>
      </div>

      <div id="statsTab" style="display:none;">
        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #0ff;margin-bottom:12px;">
          <div style="color:#0ff;font-size:14px;font-weight:bold;margin-bottom:10px;">📈 SESSION STATS</div>
          <div id="sessionStats"></div>
        </div>

        <div style="background:rgba(0,0,0,0.8);padding:12px;border:2px solid #ff0;">
          <div style="color:#ff0;font-size:14px;font-weight:bold;margin-bottom:10px;">🎲 PREDICTION BREAKDOWN</div>
          <div id="predictionStats"></div>
        </div>
      </div>
    </div>

    <div id="resizeHandle" style="position:absolute;bottom:0;right:0;width:20px;height:20px;cursor:nwse-resize;background:linear-gradient(135deg, transparent 50%, #f0f 50%);"></div>
  `;

  document.body.appendChild(dash);

  // Render bet amount buttons
  const betAmountsDiv = document.getElementById('betAmounts');
  BET_AMOUNTS.forEach(amount => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: ${amount === state.selectedAmount ? '#0f0' : '#333'};
      color: ${amount === state.selectedAmount ? '#000' : '#0ff'};
      border: 2px solid #0ff;
      padding: 10px;
      cursor: pointer;
      font-weight: bold;
      border-radius: 6px;
      font-size: 13px;
      font-family: 'Courier New', monospace;
    `;
    btn.textContent = `${amount} SOL`;
    btn.onclick = () => {
      state.selectedAmount = amount;
      updateDashboard();
    };
    betAmountsDiv.appendChild(btn);
  });

  // Render prediction buttons
  function renderPredictionButtons() {
    const timingBets = ['INSTANT_RUG', 'VERY_EARLY_RUG', 'EARLY_RUG', 'MID_EARLY_RUG', 'MID_RUG', 'MID_LATE_RUG', 'LATE_RUG', 'VERY_LATE', 'MOON'];
    const multiplierBets = ['MICRO_MULTI', 'LOW_MULTI', 'MED_LOW_MULTI', 'MED_MULTI', 'MED_HIGH_MULTI', 'HIGH_MULTI', 'VERY_HIGH_MULTI', 'MEGA_MULTI', 'ULTRA_MULTI', 'LEGENDARY'];
    const comboBets = ['QUICK_PROFIT', 'STEADY_GRIND', 'PATIENCE_PAYS', 'GRINDER_CHART'];

    const timingDiv = document.getElementById('timingBets');
    timingDiv.innerHTML = '';
    timingBets.forEach(type => {
      const pred = PREDICTIONS[type];
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: rgba(255,0,255,0.2);
        color: #f0f;
        border: 2px solid #f0f;
        padding: 10px;
        cursor: pointer;
        font-weight: bold;
        border-radius: 6px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      btn.innerHTML = `
        <span>${pred.label}</span>
        <span style="color:#0f0;font-size:14px;">${pred.odds}x</span>
      `;
      btn.onclick = () => placeBet(type);
      btn.disabled = !state.bettingOpen;
      if (!state.bettingOpen) btn.style.opacity = '0.4';
      timingDiv.appendChild(btn);
    });

    const multiplierDiv = document.getElementById('multiplierBets');
    multiplierDiv.innerHTML = '';
    multiplierBets.forEach(type => {
      const pred = PREDICTIONS[type];
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: rgba(255,255,0,0.2);
        color: #ff0;
        border: 2px solid #ff0;
        padding: 10px;
        cursor: pointer;
        font-weight: bold;
        border-radius: 6px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      btn.innerHTML = `
        <span>${pred.label}</span>
        <span style="color:#0f0;font-size:14px;">${pred.odds}x</span>
      `;
      btn.onclick = () => placeBet(type);
      btn.disabled = !state.bettingOpen;
      if (!state.bettingOpen) btn.style.opacity = '0.4';
      multiplierDiv.appendChild(btn);
    });

    const comboDiv = document.getElementById('comboBets');
    comboDiv.innerHTML = '';
    comboBets.forEach(type => {
      const pred = PREDICTIONS[type];
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: rgba(0,255,0,0.2);
        color: #0f0;
        border: 2px solid #0f0;
        padding: 10px;
        cursor: pointer;
        font-weight: bold;
        border-radius: 6px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      btn.innerHTML = `
        <span>${pred.label}</span>
        <span style="color:#ff0;font-size:14px;">${pred.odds}x</span>
      `;
      btn.onclick = () => placeBet(type);
      btn.disabled = !state.bettingOpen;
      if (!state.bettingOpen) btn.style.opacity = '0.4';
      comboDiv.appendChild(btn);
    });
  }

  renderPredictionButtons();

  function updateDashboard() {
    // Update balance display
    document.getElementById('balanceDisplay').textContent = state.balance.toFixed(4);
    document.getElementById('profitDisplay').textContent = (state.totalProfit >= 0 ? '+' : '') + state.totalProfit.toFixed(4);
    document.getElementById('profitDisplay').style.color = state.totalProfit >= 0 ? '#0f0' : '#f00';
    document.getElementById('wlDisplay').textContent = `${state.wins}/${state.losses}`;

    // Update betting status
    const bettingStatusDiv = document.getElementById('bettingStatus');
    const gameStatusDiv = document.getElementById('gameStatus');
    
    if (state.bettingOpen) {
      bettingStatusDiv.textContent = '✅ BETTING OPEN';
      bettingStatusDiv.style.color = '#0f0';
      gameStatusDiv.textContent = 'Place your predictions for the next round!';
      document.querySelector('#betTab > div').style.borderColor = '#0f0';
    } else {
      bettingStatusDiv.textContent = '🔒 BETTING CLOSED';
      bettingStatusDiv.style.color = '#f00';
      gameStatusDiv.textContent = `Round in progress: ${state.currentTick} ticks | ${state.currentMultiplier.toFixed(3)}x`;
      document.querySelector('#betTab > div').style.borderColor = '#f00';
    }

    // Update bet amount buttons
    const betAmountBtns = document.querySelectorAll('#betAmounts button');
    betAmountBtns.forEach((btn, idx) => {
      const amount = BET_AMOUNTS[idx];
      if (amount === state.selectedAmount) {
        btn.style.background = '#0f0';
        btn.style.color = '#000';
      } else {
        btn.style.background = '#333';
        btn.style.color = '#0ff';
      }
    });

    // Render prediction buttons
    renderPredictionButtons();

    // Update history
    const historyList = document.getElementById('historyList');
    if (state.betHistory.length > 0) {
      historyList.innerHTML = state.betHistory.map(bet => {
        const pred = PREDICTIONS[bet.type];
        return `
          <div style="background:rgba(${bet.won ? '0,255,0' : '255,0,0'},0.1);padding:10px;margin-bottom:8px;border:2px solid ${bet.won ? '#0f0' : '#f00'};border-radius:6px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:${bet.won ? '#0f0' : '#f00'};font-weight:bold;">${bet.won ? '✅ WIN' : '❌ LOSS'}</span>
              <span style="color:${bet.won ? '#0f0' : '#f00'};font-weight:bold;font-size:16px;">${bet.won ? '+' : ''}${bet.profit.toFixed(4)} SOL</span>
            </div>
            <div style="color:#f0f;font-size:11px;margin-bottom:4px;">${pred.label} @ ${bet.odds}x</div>
            <div style="font-size:10px;color:#888;">
              <div>Stake: ${bet.amount.toFixed(4)} SOL | Result: ${bet.peakMultiplier.toFixed(2)}x @ ${bet.totalTicks} ticks</div>
              ${bet.won ? `<div style="color:#0f0;margin-top:2px;">Payout: ${bet.payout.toFixed(4)} SOL</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      historyList.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">No bets yet</div>';
    }

    // Update stats
    updateStatsTab();
  }

  function updateStatsTab() {
    const winRate = (state.wins + state.losses) > 0 ? (state.wins / (state.wins + state.losses) * 100).toFixed(1) : '0.0';
    const avgBet = state.totalWagered > 0 && (state.wins + state.losses) > 0 ? (state.totalWagered / (state.wins + state.losses)).toFixed(4) : '0.0000';
    const roi = state.totalWagered > 0 ? ((state.totalProfit / state.totalWagered) * 100).toFixed(1) : '0.0';

    document.getElementById('sessionStats').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;">
        <div style="background:rgba(0,255,255,0.1);padding:10px;border:1px solid #0ff;border-radius:5px;">
          <div style="color:#888;font-size:10px;">Total Wagered</div>
          <div style="color:#0ff;font-size:18px;font-weight:bold;">${state.totalWagered.toFixed(4)}</div>
        </div>
        <div style="background:rgba(${state.totalProfit >= 0 ? '0,255,0' : '255,0,0'},0.1);padding:10px;border:1px solid ${state.totalProfit >= 0 ? '#0f0' : '#f00'};border-radius:5px;">
          <div style="color:#888;font-size:10px;">Net Profit</div>
          <div style="color:${state.totalProfit >= 0 ? '#0f0' : '#f00'};font-size:18px;font-weight:bold;">${state.totalProfit >= 0 ? '+' : ''}${state.totalProfit.toFixed(4)}</div>
        </div>
        <div style="background:rgba(255,0,255,0.1);padding:10px;border:1px solid #f0f;border-radius:5px;">
          <div style="color:#888;font-size:10px;">Win Rate</div>
          <div style="color:#f0f;font-size:18px;font-weight:bold;">${winRate}%</div>
        </div>
        <div style="background:rgba(255,255,0,0.1);padding:10px;border:1px solid #ff0;border-radius:5px;">
          <div style="color:#888;font-size:10px;">ROI</div>
          <div style="color:#ff0;font-size:18px;font-weight:bold;">${roi}%</div>
        </div>
        <div style="background:rgba(0,0,0,0.5);padding:10px;border:1px solid #888;border-radius:5px;">
          <div style="color:#888;font-size:10px;">Avg Bet</div>
          <div style="color:#fff;font-size:18px;font-weight:bold;">${avgBet}</div>
        </div>
        <div style="background:rgba(0,0,0,0.5);padding:10px;border:1px solid #888;border-radius:5px;">
          <div style="color:#888;font-size:10px;">Total Bets</div>
          <div style="color:#fff;font-size:18px;font-weight:bold;">${state.wins + state.losses}</div>
        </div>
      </div>
    `;

    // Prediction breakdown
    const predictionBreakdown = {};
    state.betHistory.forEach(bet => {
      if (!predictionBreakdown[bet.type]) {
        predictionBreakdown[bet.type] = { wins: 0, losses: 0, profit: 0 };
      }
      if (bet.won) {
        predictionBreakdown[bet.type].wins++;
      } else {
        predictionBreakdown[bet.type].losses++;
      }
      predictionBreakdown[bet.type].profit += bet.profit;
    });

    const predStatsHtml = Object.entries(predictionBreakdown).map(([type, stats]) => {
      const pred = PREDICTIONS[type];
      const total = stats.wins + stats.losses;
      const winRate = total > 0 ? (stats.wins / total * 100).toFixed(0) : '0';
      return `
        <div style="background:rgba(0,0,0,0.5);padding:8px;margin-bottom:6px;border:1px solid #444;border-radius:4px;font-size:11px;">
          <div style="color:#f0f;font-weight:bold;margin-bottom:4px;">${pred.label}</div>
          <div style="display:flex;justify-content:space-between;color:#888;">
            <span>W/L: ${stats.wins}/${stats.losses} (${winRate}%)</span>
            <span style="color:${stats.profit >= 0 ? '#0f0' : '#f00'};font-weight:bold;">${stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(4)}</span>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('predictionStats').innerHTML = predStatsHtml || '<div style="text-align:center;padding:20px;color:#888;">No prediction data yet</div>';
  }

  // Tab switching
  const tabBtns = dash.querySelectorAll('.tab-btn');
  const betTab = document.getElementById('betTab');
  const historyTab = document.getElementById('historyTab');
  const statsTab = document.getElementById('statsTab');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      state.activeTab = tab;

      tabBtns.forEach(b => {
        b.style.background = '#333';
        b.style.color = '#f0f';
      });
      btn.style.background = '#f0f';
      btn.style.color = '#000';

      betTab.style.display = 'none';
      historyTab.style.display = 'none';
      statsTab.style.display = 'none';

      if (tab === 'bet') betTab.style.display = 'block';
      else if (tab === 'history') historyTab.style.display = 'block';
      else if (tab === 'stats') statsTab.style.display = 'block';

      updateDashboard();
    });
  });

  // Scale slider
  const scaleSlider = document.getElementById('scaleSlider');
  const scaleValue = document.getElementById('scaleValue');
  
  scaleSlider.addEventListener('input', (e) => {
    scaleValue.textContent = e.target.value + '%';
  });
  
  scaleSlider.addEventListener('change', (e) => {
    const scale = e.target.value / 100;
    state.scale = scale;
    scaleValue.textContent = e.target.value + '%';
    dash.style.transform = `scale(${scale})`;
    localStorage.setItem('predictionsScale', scale);
  });

  // Minimize
  const minimizeBtn = document.getElementById('minimizeBtn');
  const mainContent = document.getElementById('mainContent');
  
  minimizeBtn.addEventListener('click', () => {
    state.minimized = !state.minimized;
    
    if (state.minimized) {
      mainContent.style.display = 'none';
      dash.style.height = '110px';
      minimizeBtn.textContent = '+';
      minimizeBtn.style.background = '#0f0';
    } else {
      mainContent.style.display = 'block';
      dash.style.height = savedSize.height + 'px';
      minimizeBtn.textContent = '−';
      minimizeBtn.style.background = '#ff0';
    }
  });

  // Dragging
  let isDragging = false, dragStartX, dragStartY, dashStartX, dashStartY;
  const dragHandle = document.getElementById('dragHandle');
  
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dashStartX = dash.offsetLeft;
    dashStartY = dash.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dash.style.left = (dashStartX + dx) + 'px';
    dash.style.top = (dashStartY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      localStorage.setItem('predictionsPosition', JSON.stringify({ x: dash.offsetLeft, y: dash.offsetTop }));
    }
    isDragging = false;
  });

  // Resizing
  let isResizing = false, resizeStartX, resizeStartY, dashStartWidth, dashStartHeight;
  const resizeHandle = document.getElementById('resizeHandle');
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    dashStartWidth = dash.offsetWidth;
    dashStartHeight = dash.offsetHeight;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    dash.style.width = Math.max(400, dashStartWidth + dx / state.scale) + 'px';
    dash.style.height = Math.max(400, dashStartHeight + dy / state.scale) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      localStorage.setItem('predictionsSize', JSON.stringify({ width: dash.offsetWidth, height: dash.offsetHeight }));
    }
    isResizing = false;
  });

  // Connect to Socket.IO
  const sock = io("https://backend.rugs.fun", {
    transports: ["websocket"],
    query: { "frontend-version": "1.0" }
  });

  sock.on("connect", () => {
    console.log('🎲 Predictions Market connected');
    updateDashboard();
  });

  sock.on("gameStateUpdate", data => {
    if (!data) return;
    const { active, price, gameId } = data;

    // New game started
    if (gameId && gameId !== state.currentGameId) {
      // Resolve previous round bets
      if (state.currentGameId && state.activeBets.length > 0) {
        resolveBets(state.peakMultiplier, state.currentTick);
      }

      // Store round history
      if (state.currentGameId) {
        state.roundHistory.push({
          gameId: state.currentGameId,
          peakMultiplier: state.peakMultiplier,
          ticks: state.currentTick,
          timestamp: Date.now()
        });
        if (state.roundHistory.length > 50) state.roundHistory.shift();
      }

      // Reset for new round
      state.currentGameId = gameId;
      state.gameActive = active;
      state.currentTick = 0;
      state.peakMultiplier = 1;
      state.bettingOpen = true;

      showNotification('🎲 NEW ROUND - Betting open!', '#0f0');
    }

    // Update game state
    state.gameActive = active;
    state.currentMultiplier = price || 1;

    if (active) {
      // Game is running - close betting
      if (state.bettingOpen) {
        state.bettingOpen = false;
        if (state.activeBets.length > 0) {
          showNotification('🔒 Betting closed - Round started!', '#ff0');
        }
      }

      state.currentTick++;
      if (state.currentMultiplier > state.peakMultiplier) {
        state.peakMultiplier = state.currentMultiplier;
      }

      // Check active bets status in real-time
      if (state.activeBets.length > 0) {
        checkActiveBetsStatus();
      }
    }

    updateDashboard();
  });

  // Initial render
  console.log('🎲 PREDICTIONS MARKET LOADED');
  console.log('💰 Demo balance:', DEMO_START_BALANCE, 'SOL');
  console.log('📊 Available predictions:', Object.keys(PREDICTIONS).length);
  console.log('✅ Features: Real-time bet tracking, win/loss alerts, expanded markets');
  updateDashboard();
})();
