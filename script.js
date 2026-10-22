/* ==================== GAME STATE MANAGEMENT ==================== */
const STATE = {
    balance: 1000000,
    selectedChip: 500000,
    currentPhase: 'BETTING', // 'BETTING', 'SHAKING', 'AWAIT_OPEN', 'REVEALED'
    timer: 20,
    sessionId: 104928,
    bets: {
        TAI: 0,
        XIU: 0,
        BAO_ANY: 0,
        BAO_EXACT: 0,
        SUMS: {} // sum -> amount
    },
    history: [], // [{ session, dice: [1,2,3], sum, result: 'TAI'/'XIU'/'BAO' }]
    soundEnabled: true,
    soundCtx: null,
    bowlPos: { x: 0, y: 0 },
    isDraggingBowl: false,
    dragStart: { x: 0, y: 0 }
};

/* ==================== AUDIO SYSTEM ==================== */
function initAudio() {
    if (!STATE.soundCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) STATE.soundCtx = new AudioCtx();
    }
}

function playSound(type) {
    if (!STATE.soundEnabled || !STATE.soundCtx) return;
    try {
        const ctx = STATE.soundCtx;
        if (ctx.state === 'suspended') ctx.resume();

        if (type === 'chip') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'shake') {
            for (let i = 0; i < 6; i++) {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(150 + Math.random() * 200, ctx.currentTime);
                    gain.gain.setValueAtTime(0.2, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.05);
                }, i * 80);
            }
        } else if (type === 'win') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, ctx.currentTime);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.3);
                }, idx * 100);
            });
        }
    } catch (e) {
        console.warn("Audio playback error:", e);
    }
}

function toggleAudio() {
    STATE.soundEnabled = !STATE.soundEnabled;
    const icon = document.getElementById('sound-icon');
    icon.className = STATE.soundEnabled ? 'fa-solid fa-volume-high text-xs' : 'fa-solid fa-volume-xmark text-xs';
    if (STATE.soundEnabled) initAudio();
}

/* ==================== LOCAL STORAGE ==================== */
function loadState() {
    const saved = localStorage.getItem('taixiu_vip_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            STATE.balance = parsed.balance ?? 1000000;
            STATE.history = parsed.history ?? [];
            STATE.sessionId = parsed.sessionId ?? 104928;
        } catch (e) {}
    }
    if (STATE.history.length === 0) {
        for (let i = 0; i < 25; i++) {
            generateFakeHistory();
        }
    }
    updateBalanceUI();
}

function saveState() {
    localStorage.setItem('taixiu_vip_data', JSON.stringify({
        balance: STATE.balance,
        history: STATE.history,
        sessionId: STATE.sessionId
    }));
}

function generateFakeHistory() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const d3 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2 + d3;
    let result = 'XIU';
    if (d1 === d2 && d2 === d3) result = 'BAO';
    else if (sum >= 11) result = 'TAI';

    STATE.history.push({
        session: STATE.sessionId++,
        dice: [d1, d2, d3],
        sum: sum,
        result: result
    });
}

/* ==================== RENDER DICE & UI ==================== */
function renderDice(diceArr) {
    diceArr.forEach((val, idx) => {
        const el = document.getElementById(`dice-${idx + 1}`);
        el.innerHTML = '';
        
        const pipPositions = {
            1: [4],
            2: [0, 8],
            3: [0, 4, 8],
            4: [0, 2, 6, 8],
            5: [0, 2, 4, 6, 8],
            6: [0, 2, 3, 5, 6, 8]
        }[val];

        for (let cell = 0; cell < 9; cell++) {
            const pipDiv = document.createElement('div');
            if (pipPositions.includes(cell)) {
                pipDiv.className = `pip ${val === 1 || val === 4 ? 'pip-red' : ''}`;
            }
            el.appendChild(pipDiv);
        }
    });
}

function updateBalanceUI() {
    document.getElementById('user-balance').innerText = STATE.balance.toLocaleString('vi-VN');
    document.getElementById('session-id').innerText = STATE.sessionId;
}

function addFreeChips() {
    STATE.balance += 500000;
    saveState();
    updateBalanceUI();
    playSound('chip');
}

/* ==================== BETTING SYSTEM ==================== */
function selectChip(amount) {
    STATE.selectedChip = amount;
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.remove('active-chip', 'bg-amber-600', 'border-amber-400');
    });
    event.currentTarget.classList.add('active-chip', 'bg-amber-600', 'border-amber-400');
    playSound('chip');
}

function placeBet(type) {
    if (STATE.currentPhase !== 'BETTING') return;
    initAudio();

    if (STATE.balance < STATE.selectedChip) {
        alert('Số dư không đủ! Vui lòng nạp thêm chip.');
        return;
    }

    STATE.balance -= STATE.selectedChip;
    STATE.bets[type] = (STATE.bets[type] || 0) + STATE.selectedChip;
    
    updateBalanceUI();
    updateBetsUI();
    playSound('chip');
}

function placeSumBet(sum, ratio) {
    if (STATE.currentPhase !== 'BETTING') return;
    initAudio();

    if (STATE.balance < STATE.selectedChip) {
        alert('Số dư không đủ!');
        return;
    }

    STATE.balance -= STATE.selectedChip;
    STATE.bets.SUMS[sum] = (STATE.bets.SUMS[sum] || 0) + STATE.selectedChip;
    
    updateBalanceUI();
    toggleModal('sum-bet-modal');
    playSound('chip');
}

function updateBetsUI() {
    document.getElementById('bet-tai-amount').innerText = (STATE.bets.TAI).toLocaleString('vi-VN');
    document.getElementById('bet-xiu-amount').innerText = (STATE.bets.XIU).toLocaleString('vi-VN');
    document.getElementById('bet-bao_any-amount').innerText = (STATE.bets.BAO_ANY).toLocaleString('vi-VN');
    document.getElementById('bet-bao_exact-amount').innerText = (STATE.bets.BAO_EXACT).toLocaleString('vi-VN');
}

function clearBets() {
    if (STATE.currentPhase !== 'BETTING') return;
    let refund = STATE.bets.TAI + STATE.bets.XIU + STATE.bets.BAO_ANY + STATE.bets.BAO_EXACT;
    Object.values(STATE.bets.SUMS).forEach(val => refund += val);
    
    STATE.balance += refund;
    STATE.bets = { TAI: 0, XIU: 0, BAO_ANY: 0, BAO_EXACT: 0, SUMS: {} };
    updateBalanceUI();
    updateBetsUI();
}

function doubleBet() {
    if (STATE.currentPhase !== 'BETTING') return;
    let totalCurrent = STATE.bets.TAI + STATE.bets.XIU + STATE.bets.BAO_ANY + STATE.bets.BAO_EXACT;
    if (totalCurrent === 0) return;

    if (STATE.balance < totalCurrent) {
        alert('Số dư không đủ để gấp đôi!');
        return;
    }

    STATE.balance -= totalCurrent;
    STATE.bets.TAI *= 2;
    STATE.bets.XIU *= 2;
    STATE.bets.BAO_ANY *= 2;
    STATE.bets.BAO_EXACT *= 2;
    updateBalanceUI();
    updateBetsUI();
    playSound('chip');
}

function allIn() {
    if (STATE.currentPhase !== 'BETTING' || STATE.balance <= 0) return;
    if (STATE.bets.XIU > 0) {
        STATE.bets.XIU += STATE.balance;
    } else {
        STATE.bets.TAI += STATE.balance;
    }
    STATE.balance = 0;
    updateBalanceUI();
    updateBetsUI();
    playSound('chip');
}

/* ==================== 360-DEGREE BOWL DRAGGING MECHANISM ==================== */
const bowlEl = document.getElementById('bowl');

function setupBowlDrag() {
    const startDrag = (e) => {
        if (STATE.currentPhase !== 'AWAIT_OPEN') return;
        STATE.isDraggingBowl = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        STATE.dragStart = { x: clientX, y: clientY };
        bowlEl.style.transition = 'none';
    };

    const doDrag = (e) => {
        if (!STATE.isDraggingBowl) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - STATE.dragStart.x;
        const deltaY = clientY - STATE.dragStart.y;
        
        STATE.bowlPos = { x: deltaX, y: deltaY };
        bowlEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        const distance = Math.hypot(deltaX, deltaY);
        if (distance > 90) {
            STATE.isDraggingBowl = false;
            quickOpenBowl();
        }
    };

    const endDrag = () => {
        if (!STATE.isDraggingBowl) return;
        STATE.isDraggingBowl = false;
        bowlEl.style.transition = 'transform 0.3s ease-out';
        bowlEl.style.transform = 'translate(0px, 0px)';
    };

    bowlEl.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', endDrag);

    bowlEl.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('touchmove', doDrag, { passive: true });
    window.addEventListener('touchend', endDrag);
}

function resetBowl() {
    bowlEl.style.transition = 'transform 0.5s ease-out';
    bowlEl.style.transform = 'translate(0px, 0px)';
    document.getElementById('result-overlay').classList.add('opacity-0');
    document.getElementById('quick-open-btn').classList.add('opacity-0', 'pointer-events-none');
}

function quickOpenBowl() {
    STATE.currentPhase = 'REVEALED';
    bowlEl.style.transition = 'transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    bowlEl.style.transform = 'translate(0px, -240px)';
    document.getElementById('quick-open-btn').classList.add('opacity-0', 'pointer-events-none');

    setTimeout(() => {
        document.getElementById('result-overlay').classList.remove('opacity-0');
        evaluateRoundResults();
    }, 300);
}

/* ==================== GAME ROUND & LOOP ==================== */
function startGameLoop() {
    setInterval(() => {
        if (STATE.currentPhase === 'BETTING') {
            STATE.timer--;
            document.getElementById('timer-count').innerText = STATE.timer;

            if (STATE.timer <= 0) {
                triggerShakingPhase();
            }
        } else if (STATE.currentPhase === 'AWAIT_OPEN') {
            STATE.timer--;
            document.getElementById('timer-count').innerText = STATE.timer;

            if (STATE.timer <= 0) {
                quickOpenBowl();
            }
        }
    }, 1000);
}

function triggerShakingPhase() {
    STATE.currentPhase = 'SHAKING';
    document.getElementById('game-status-badge').innerHTML = `XÓC ĐĨA...`;
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const d3 = Math.floor(Math.random() * 6) + 1;
    STATE.currentResult = { d1, d2, d3, sum: d1 + d2 + d3 };

    renderDice([d1, d2, d3]);
    playSound('shake');

    const plate = document.querySelector('.plate-container');
    plate.classList.add('animate-shake');

    setTimeout(() => {
        plate.classList.remove('animate-shake');
        STATE.currentPhase = 'AWAIT_OPEN';
        STATE.timer = 10;
        document.getElementById('game-status-badge').innerHTML = `VUỐT BÁT (<span id="timer-count" class="text-white text-sm font-extrabold">10</span>s)`;
        document.getElementById('quick-open-btn').classList.remove('opacity-0', 'pointer-events-none');
    }, 2000);
}

function evaluateRoundResults() {
    const { d1, d2, d3, sum } = STATE.currentResult;
    let resultType = 'XIU';
    if (d1 === d2 && d2 === d3) resultType = 'BAO';
    else if (sum >= 11) resultType = 'TAI';

    document.getElementById('result-sum').innerText = sum;
    document.getElementById('result-text').innerText = resultType === 'BAO' ? 'BÃO' : resultType;
    document.getElementById('result-text').className = `text-base font-bold uppercase tracking-widest mt-1 ${
        resultType === 'TAI' ? 'text-red-500' : resultType === 'XIU' ? 'text-blue-500' : 'text-amber-400'
    }`;

    let winnings = 0;
    const houseOdds = 0.9;

    if (resultType === 'TAI' && STATE.bets.TAI > 0) {
        winnings += STATE.bets.TAI + (STATE.bets.TAI * houseOdds);
    }
    if (resultType === 'XIU' && STATE.bets.XIU > 0) {
        winnings += STATE.bets.XIU + (STATE.bets.XIU * houseOdds);
    }
    if (resultType === 'BAO') {
        if (STATE.bets.BAO_ANY > 0) winnings += STATE.bets.BAO_ANY + (STATE.bets.BAO_ANY * 30);
        if (STATE.bets.BAO_EXACT > 0) winnings += STATE.bets.BAO_EXACT + (STATE.bets.BAO_EXACT * 150);
    }

    if (STATE.bets.SUMS[sum]) {
        const ratios = { 4: 50, 5: 30, 6: 18, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 18, 16: 30, 17: 50 };
        const mult = ratios[sum] || 6;
        winnings += STATE.bets.SUMS[sum] + (STATE.bets.SUMS[sum] * mult);
    }

    if (winnings > 0) {
        STATE.balance += winnings;
        playSound('win');
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        
        const glowEl = document.getElementById(`win-glow-${resultType}`);
        if (glowEl) {
            glowEl.classList.remove('opacity-0');
            setTimeout(() => glowEl.classList.add('opacity-0'), 3000);
        }
    }

    STATE.history.push({
        session: STATE.sessionId,
        dice: [d1, d2, d3],
        sum: sum,
        result: resultType
    });

    STATE.sessionId++;
    saveState();
    updateBalanceUI();
    renderBeadPlate();
    renderTrendCanvas();
    updateAISoiCau();

    setTimeout(() => {
        STATE.bets = { TAI: 0, XIU: 0, BAO_ANY: 0, BAO_EXACT: 0, SUMS: {} };
        updateBetsUI();
        resetBowl();
        STATE.currentPhase = 'BETTING';
        STATE.timer = 20;
        document.getElementById('game-status-badge').innerHTML = `ĐẶT CƯỢC (<span id="timer-count" class="text-white text-sm font-extrabold">20</span>s)`;
    }, 4000);
}

/* ==================== SOI CẦU MATRIX & CANVASES ==================== */
function renderBeadPlate() {
    const grid = document.getElementById('bead-plate-grid');
    grid.innerHTML = '';

    const recentHistory = STATE.history.slice(-66);

    for (let i = 0; i < 66; i++) {
        const cell = document.createElement('div');
        cell.className = 'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border border-slate-800';

        if (recentHistory[i]) {
            const item = recentHistory[i];
            if (item.result === 'TAI') {
                cell.className += ' bg-red-600 text-white border-red-400';
                cell.innerText = 'T';
            } else if (item.result === 'XIU') {
                cell.className += ' bg-blue-600 text-white border-blue-400';
                cell.innerText = 'X';
            } else {
                cell.className += ' bg-amber-500 text-slate-950 border-yellow-300';
                cell.innerText = 'B';
            }
        } else {
            cell.className += ' bg-slate-900/40';
        }
        grid.appendChild(cell);
    }
}

function renderTrendCanvas() {
    const canvas = document.getElementById('trend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const width = canvas.width;
    const height = canvas.height;
    const recent = STATE.history.slice(-20);

    ctx.clearRect(0, 0, width, height);

    if (recent.length < 2) return;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const stepX = width / 19;
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFD700';

    recent.forEach((item, idx) => {
        const normY = height - ((item.sum - 3) / 15) * height;
        const x = idx * stepX;

        if (idx === 0) ctx.moveTo(x, normY);
        else ctx.lineTo(x, normY);
    });
    ctx.stroke();

    recent.forEach((item, idx) => {
        const normY = height - ((item.sum - 3) / 15) * height;
        const x = idx * stepX;

        ctx.beginPath();
        ctx.arc(x, normY, 4, 0, Math.PI * 2);
        ctx.fillStyle = item.result === 'TAI' ? '#e11d48' : item.result === 'XIU' ? '#2563eb' : '#f59e0b';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });
}

/* ==================== AI SOI CẦU PATTERN ENGINE ==================== */
function updateAISoiCau() {
    const recent = STATE.history.slice(-20);
    let taiCount = 0, xiuCount = 0, baoCount = 0;
    let currentStreak = 1;
    let maxStreak = 1;

    recent.forEach((item, idx) => {
        if (item.result === 'TAI') taiCount++;
        else if (item.result === 'XIU') xiuCount++;
        else baoCount++;

        if (idx > 0 && item.result === recent[idx - 1].result) {
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            currentStreak = 1;
        }
    });

    document.getElementById('stat-tai-count').innerText = taiCount;
    document.getElementById('stat-xiu-count').innerText = xiuCount;
    document.getElementById('stat-bao-count').innerText = baoCount;
    document.getElementById('stat-max-streak').innerText = maxStreak;

    let patternTag = "Cầu Nhảy 1-1";
    let recChoice = "TÀI";
    let taiPercent = 52;

    const lastResult = recent[recent.length - 1]?.result || 'TAI';

    if (currentStreak >= 3) {
        patternTag = `Cầu Bệt ${lastResult} (${currentStreak} tay)`;
        recChoice = lastResult;
        taiPercent = lastResult === 'TAI' ? 68 : 32;
    } else if (recent.length >= 4) {
        const r = recent.slice(-4).map(x => x.result);
        if (r[0] !== r[1] && r[1] !== r[2] && r[2] !== r[3]) {
            patternTag = "Cầu 1-1 Chuẩn";
            recChoice = lastResult === 'TAI' ? 'XỈU' : 'TÀI';
            taiPercent = recChoice === 'TAI' ? 62 : 38;
        } else {
            patternTag = "Cầu 2-2 / Cầu Đôi";
            recChoice = Math.random() > 0.5 ? 'TÀI' : 'XỈU';
            taiPercent = recChoice === 'TAI' ? 55 : 45;
        }
    }

    document.getElementById('ai-pattern-tag').innerText = patternTag;
    document.getElementById('ai-recommendation').innerText = `${recChoice} (${taiPercent}%)`;
    document.getElementById('ai-bar-tai').style.width = `${taiPercent}%`;
    document.getElementById('ai-bar-xiu').style.width = `${100 - taiPercent}%`;
    document.getElementById('ai-percent-tai').innerText = `TÀI: ${taiPercent}%`;
    document.getElementById('ai-percent-xiu').innerText = `XỈU: ${100 - taiPercent}%`;
}

/* ==================== LIVE BOT CHAT SIMULATOR ==================== */
const FAKE_BOTS = [
    'Minh_Macau', 'DaiGiaPhuTho', 'ChienShat68', 'Phuong_VIP', 'Hung_ThanBai',
    'SieuCapVip', 'Thanh_SoiCau', 'Linh_Danang', 'Bao_Tran99', 'Phong_ThienHa'
];
const CHAT_COMMENTS = [
    'Tay này bệt Tài chắc luôn!', 'Cầu 1-1 anh em ơi, bẻ Xỉu!', 'Hôm nay vào dây đỏ rồi!',
    'AI phán chuẩn vãi 5 sao', 'Hũ nổ chưa anh em?', 'All in Xỉu tay này!', 'Vừa ăn được 5M ngon lành.'
];

function addChatMessage(user, text, isGold = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'leading-tight';
    row.innerHTML = `<span class="${isGold ? 'text-amber-400 font-bold' : 'text-slate-400 font-semibold'}">${user}:</span> <span class="text-slate-200">${text}</span>`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

function handleUserChat(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (!input.value.trim()) return;
    addChatMessage('Bạn VIP', input.value, true);
    input.value = '';
}

function startBotChatLoop() {
    setInterval(() => {
        if (Math.random() > 0.4) {
            const bot = FAKE_BOTS[Math.floor(Math.random() * FAKE_BOTS.length)];
            const msg = CHAT_COMMENTS[Math.floor(Math.random() * CHAT_COMMENTS.length)];
            addChatMessage(bot, msg);
        }
    }, 3500);
}

/* ==================== MODAL UTILS ==================== */
function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.toggle('hidden');
    if (modalId === 'history-modal' && !modal.classList.contains('hidden')) {
        renderHistoryList();
    }
}

function renderHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '';
    STATE.history.slice(-15).reverse().forEach(item => {
        const row = document.createElement('div');
        row.className = 'bg-slate-950 p-2 rounded border border-slate-800 flex justify-between items-center';
        row.innerHTML = `
            <div>
                <span class="text-slate-400 font-bold">#${item.session}</span> - 
                <span class="text-amber-300 font-bold">[${item.dice.join(', ')}]</span>
            </div>
            <div class="font-extrabold ${item.result === 'TAI' ? 'text-red-500' : item.result === 'XIU' ? 'text-blue-500' : 'text-amber-400'}">
                TỔNG ${item.sum} (${item.result})
            </div>
        `;
        container.appendChild(row);
    });
}

/* ==================== INITIALIZATION ==================== */
window.onload = function() {
    loadState();
    setupBowlDrag();
    renderDice([1, 2, 3]);
    renderBeadPlate();
    renderTrendCanvas();
    updateAISoiCau();
    startGameLoop();
    startBotChatLoop();

    window.addEventListener('resize', () => {
        renderTrendCanvas();
    });
};