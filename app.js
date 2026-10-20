/**
 * FocusForge v2.0 - Core Engine
 * Zero-dependency, LocalStorage-backed Study Manager.
 */

class AudioNotifier {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
    }

    playChime(type = 'success') {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'success') {
            // Ascending major chime
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5
            
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            
            osc.start(now);
            osc.stop(now + 0.8);
        } else if (type === 'fail') {
            // Low dissonance buzzer
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(110, now + 0.4);

            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            osc.start(now);
            osc.stop(now + 0.5);
        }
    }
}

// Global State
const state = {
    mode: 'custom',
    targetSeconds: 0,
    remainingSeconds: 0,
    isHardcore: false,
    intent: '',
    
    // Runtime counters
    isRunning: false,
    isOnBreak: false,
    sessionStartTime: null,
    currentBreakStartTime: null,
    breaks: [],
    
    // Tickers
    timerInterval: null,
    breakInterval: null,
    
    // Hardcore fail flag
    hardcoreFailed: false
};

const audio = new AudioNotifier();

// DOM Cache
const dom = {
    // Screens
    screens: document.querySelectorAll('.screen'),
    setupScreen: document.getElementById('setup-screen'),
    timerScreen: document.getElementById('timer-screen'),
    reportScreen: document.getElementById('report-screen'),
    historyScreen: document.getElementById('history-screen'),

    // Setup fields
    taskIntent: document.getElementById('task-intent'),
    timerMode: document.getElementById('timer-mode'),
    customInputs: document.getElementById('custom-time-inputs'),
    blockInputs: document.getElementById('block-inputs'),
    timeInput: document.getElementById('time-input'),
    blockInput: document.getElementById('block-input'),
    hardcoreMode: document.getElementById('hardcore-mode'),
    startBtn: document.getElementById('start-btn'),
    viewHistoryBtn: document.getElementById('view-history-btn'),

    // Active Timer
    statusBadge: document.getElementById('status-badge'),
    displayIntent: document.getElementById('display-intent'),
    timeDisplay: document.getElementById('time-display'),
    breakWrapper: document.getElementById('break-display-wrapper'),
    breakTimer: document.getElementById('break-timer'),
    breakBtn: document.getElementById('break-btn'),
    stopBtn: document.getElementById('stop-btn'),

    // Report
    reportTypeBadge: document.getElementById('report-type-badge'),
    reportTitle: document.getElementById('report-title'),
    starsDisplay: document.getElementById('stars-display'),
    rankDisplay: document.getElementById('rank-display'),
    efficiencyBar: document.getElementById('efficiency-bar'),
    efficiencyPercent: document.getElementById('efficiency-percent'),
    judgeVerdict: document.getElementById('judge-verdict'),
    repIntent: document.getElementById('rep-intent'),
    repFocus: document.getElementById('rep-focus'),
    repClock: document.getElementById('rep-clock'),
    repBreaks: document.getElementById('rep-breaks'),
    breakBreakdownWrapper: document.getElementById('break-breakdown-wrapper'),
    breakBreakdownList: document.getElementById('break-breakdown-list'),
    newSessionBtn: document.getElementById('new-session-btn'),
    reportHistoryBtn: document.getElementById('report-history-btn'),

    // History
    historyTableBody: document.getElementById('history-table-body'),
    backToSetupBtn: document.getElementById('back-to-setup-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn')
};

// Screen Router
function showScreen(screenEl) {
    dom.screens.forEach(s => s.classList.remove('active'));
    screenEl.classList.add('active');
}

// Time Formatting Utilities
function formatDuration(ms) {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;

    const pad = n => n.toString().padStart(2, '0');
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    return `${m}m ${pad(s)}s`;
}

function formatClockDisplay(totalSeconds) {
    const safeSecs = Math.max(0, totalSeconds);
    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;

    const pad = n => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Setup Event Handlers
dom.timerMode.addEventListener('change', () => {
    state.mode = dom.timerMode.value;
    if (state.mode === 'custom') {
        dom.customInputs.classList.remove('hidden');
        dom.blockInputs.classList.add('hidden');
    } else {
        dom.customInputs.classList.add('hidden');
        dom.blockInputs.classList.remove('hidden');
    }
});

dom.startBtn.addEventListener('click', startSession);
dom.viewHistoryBtn.addEventListener('click', () => {
    renderHistoryTable();
    showScreen(dom.historyScreen);
});

function startSession() {
    state.intent = dom.taskIntent.value.trim() || 'Unspecified Objective';
    state.isHardcore = dom.hardcoreMode.checked;
    state.breaks = [];
    state.isOnBreak = false;
    state.hardcoreFailed = false;

    // Calculate Target Seconds
    if (state.mode === 'custom') {
        const rawTime = parseFloat(dom.timeInput.value) || 1.45;
        const hours = Math.floor(rawTime);
        const minutes = Math.round((rawTime - hours) * 100);
        state.targetSeconds = (hours * 3600) + (minutes * 60);
    } else {
        const blocks = parseInt(dom.blockInput.value, 10) || 1;
        state.targetSeconds = blocks * 45 * 60;
    }

    if (state.targetSeconds <= 0) state.targetSeconds = 60; // 1 min fallback

    state.remainingSeconds = state.targetSeconds;
    state.sessionStartTime = new Date();
    state.isRunning = true;

    // Prep UI
    dom.displayIntent.textContent = `Target: ${state.intent}`;
    dom.statusBadge.textContent = '⚡ FOCUSING';
    dom.statusBadge.classList.remove('break-mode');
    dom.breakWrapper.classList.remove('visible');
    dom.breakBtn.textContent = '☕ Take Break (b)';
    dom.timeDisplay.textContent = formatClockDisplay(state.remainingSeconds);

    showScreen(dom.timerScreen);

    // Start Main Interval
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(tick, 1000);
}

function tick() {
    if (state.isOnBreak) return;

    state.remainingSeconds--;
    dom.timeDisplay.textContent = formatClockDisplay(state.remainingSeconds);

    if (state.remainingSeconds <= 0) {
        completeSession(false);
    }
}

// Break Handling (Key 'b')
function toggleBreak() {
    if (!state.isRunning) return;

    state.isOnBreak = !state.isOnBreak;

    if (state.isOnBreak) {
        // Break starts
        state.currentBreakStartTime = new Date();
        dom.statusBadge.textContent = '☕ ON BREAK';
        dom.statusBadge.classList.add('break-mode');
        dom.breakBtn.textContent = '▶️ Resume Work (b)';
        dom.breakWrapper.classList.add('visible');
        dom.breakTimer.textContent = '00:00';

        // Start sub-ticker for live break display
        clearInterval(state.breakInterval);
        state.breakInterval = setInterval(() => {
            const currentBreakElapsed = Math.floor((new Date() - state.currentBreakStartTime) / 1000);
            const m = Math.floor(currentBreakElapsed / 60);
            const s = currentBreakElapsed % 60;
            dom.breakTimer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

            // Check Hardcore condition (> 15 minutes = 900 seconds)
            if (state.isHardcore && currentBreakElapsed >= 900) {
                clearInterval(state.breakInterval);
                state.hardcoreFailed = true;
                completeSession(true, true);
            }
        }, 1000);

    } else {
        // Break ends
        clearInterval(state.breakInterval);
        const breakEndTime = new Date();
        const durationMs = breakEndTime - state.currentBreakStartTime;
        state.breaks.push({
            number: state.breaks.length + 1,
            durationMs: durationMs
        });

        dom.statusBadge.textContent = '⚡ FOCUSING';
        dom.statusBadge.classList.remove('break-mode');
        dom.breakBtn.textContent = '☕ Take Break (b)';
        dom.breakWrapper.classList.remove('visible');
    }
}

dom.breakBtn.addEventListener('click', toggleBreak);
dom.stopBtn.addEventListener('click', () => completeSession(true));

// Termination and Assessment
function completeSession(stoppedEarly = false, hardcoreTripped = false) {
    clearInterval(state.timerInterval);
    clearInterval(state.breakInterval);
    state.isRunning = false;

    const sessionEndTime = new Date();
    
    // Close active break if session ended mid-break
    if (state.isOnBreak) {
        const durationMs = sessionEndTime - state.currentBreakStartTime;
        state.breaks.push({
            number: state.breaks.length + 1,
            durationMs: durationMs
        });
        state.isOnBreak = false;
    }

    const elapsedRealMs = Math.max(1000, sessionEndTime - state.sessionStartTime);
    const focusedSecs = state.targetSeconds - Math.max(0, state.remainingSeconds);
    const focusedMs = focusedSecs * 1000;

    let totalBreakMs = 0;
    state.breaks.forEach(b => { totalBreakMs += b.durationMs; });

    // Efficiency Calculation
    let efficiency = (focusedMs / elapsedRealMs) * 100;
    if (efficiency > 100) efficiency = 100;
    if (efficiency < 0 || isNaN(efficiency)) efficiency = 0;

    // Star & Rank Evaluation
    let stars = "⭐⭐⭐⭐⭐";
    let rank = "👑 GOD TIER FOCUS";
    let verdict = "Flawless session. Zero hesitation, peak efficiency.";
    let barColor = "var(--accent-emerald)";

    if (hardcoreTripped) {
        stars = "0 Stars";
        rank = "💀 HARDCORE CASUALTY";
        verdict = "Hardcore rule violated: Single break exceeded 15 minutes. Session terminated with zero credit.";
        efficiency = 0;
        barColor = "var(--accent-crimson)";
        audio.playChime('fail');
    } else if (focusedSecs < 60) {
        stars = "0 Stars";
        rank = "🏃 ABORTED";
        verdict = "You called it quits under 60 seconds. Set an achievable target and try again.";
        efficiency = 0;
        barColor = "var(--accent-crimson)";
        audio.playChime('fail');
    } else if (efficiency >= 96) {
        stars = "⭐⭐⭐⭐⭐";
        rank = "👑 GOD TIER FOCUS";
        verdict = "Flawless discipline. Minimal distractions and maximum engagement.";
        barColor = "var(--accent-emerald)";
        audio.playChime('success');
    } else if (efficiency >= 89) {
        stars = "⭐⭐⭐⭐";
        rank = "🔥 ELITE SCHOLAR";
        verdict = "Strong, disciplined pace with sensible pauses. High-impact work.";
        barColor = "var(--accent-emerald)";
        audio.playChime('success');
    } else if (efficiency >= 80) {
        stars = "⭐⭐⭐";
        rank = "⚖️ BALANCED WORKER";
        verdict = "Honest effort, though break creep was noticeable. Keep intervals tight.";
        barColor = "var(--accent-amber)";
        audio.playChime('success');
    } else if (efficiency >= 66) {
        stars = "⭐⭐";
        rank = "🥱 DISTRACTED WANDERER";
        verdict = "Significant drift. The clock ran away while you were checked out.";
        barColor = "var(--accent-amber)";
        audio.playChime('fail');
    } else {
        stars = "⭐";
        rank = "🤡 PROCRASTINATOR";
        verdict = "More time spent away than on-task. Quarantine notifications next time.";
        barColor = "var(--accent-crimson)";
        audio.playChime('fail');
    }

    // Populate Report UI
    dom.reportTypeBadge.textContent = hardcoreTripped ? "DISQUALIFIED" : (stoppedEarly ? "STOPPED EARLY" : "COMPLETED");
    dom.starsDisplay.textContent = stars;
    dom.rankDisplay.textContent = rank;
    dom.judgeVerdict.textContent = `"${verdict}"`;

    dom.efficiencyPercent.textContent = `${efficiency.toFixed(1)}%`;
    dom.efficiencyBar.style.width = `${efficiency}%`;
    dom.efficiencyBar.style.backgroundColor = barColor;

    dom.repIntent.textContent = state.intent;
    dom.repFocus.textContent = formatDuration(focusedMs);
    dom.repClock.textContent = formatDuration(elapsedRealMs);
    dom.repBreaks.textContent = `${state.breaks.length} (${formatDuration(totalBreakMs)})`;

    // Populate Breakdowns
    if (state.breaks.length > 0) {
        dom.breakBreakdownWrapper.classList.remove('hidden');
        dom.breakBreakdownList.innerHTML = state.breaks
            .map(b => `<li>Break #${b.number}: ${formatDuration(b.durationMs)}</li>`)
            .join('');
    } else {
        dom.breakBreakdownWrapper.classList.add('hidden');
        dom.breakBreakdownList.innerHTML = '';
    }

    // Save Record to LocalStorage
    saveSessionRecord({
        date: new Date().toISOString(),
        intent: state.intent,
        focusSecs: focusedSecs,
        clockSecs: Math.floor(elapsedRealMs / 1000),
        efficiency: efficiency.toFixed(1),
        rank: rank,
        stars: stars
    });

    showScreen(dom.reportScreen);
}

// LocalStorage & Archive Management
const STORAGE_KEY = 'focusforge_history_v1';

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveSessionRecord(record) {
    const history = getHistory();
    history.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function renderHistoryTable() {
    const history = getHistory();
    if (history.length === 0) {
        dom.historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No recorded sessions found.</td></tr>`;
        return;
    }

    dom.historyTableBody.innerHTML = history.map(item => {
        const dateObj = new Date(item.date);
        const formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
            <tr>
                <td>${formattedDate}</td>
                <td><strong>${escapeHtml(item.intent)}</strong></td>
                <td>${formatDuration(item.focusSecs * 1000)}</td>
                <td>${formatDuration(item.clockSecs * 1000)}</td>
                <td>${item.efficiency}%</td>
                <td>${item.stars}</td>
            </tr>
        `;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// History Controls
dom.backToSetupBtn.addEventListener('click', () => showScreen(dom.setupScreen));
dom.newSessionBtn.addEventListener('click', () => showScreen(dom.setupScreen));
dom.reportHistoryBtn.addEventListener('click', () => {
    renderHistoryTable();
    showScreen(dom.historyScreen);
});

dom.clearHistoryBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to permanently clear all study logs?")) {
        localStorage.removeItem(STORAGE_KEY);
        renderHistoryTable();
    }
});

dom.exportCsvBtn.addEventListener('click', () => {
    const history = getHistory();
    if (history.length === 0) return alert("No logs available to export.");

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Intent,FocusSeconds,ClockSeconds,EfficiencyPercent,Rank,Stars\n";

    history.forEach(row => {
        const cleanIntent = `"${row.intent.replace(/"/g, '""')}"`;
        const cleanRank = `"${row.rank.replace(/"/g, '""')}"`;
        csvContent += `${row.date},${cleanIntent},${row.focusSecs},${row.clockSecs},${row.efficiency},${cleanRank},"${row.stars}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `focusforge_archive_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    // Ignore keystrokes when editing form inputs
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') return;

    if (e.key === 'b' || e.key === 'B') {
        if (state.isRunning) {
            e.preventDefault();
            toggleBreak();
        }
    } else if (e.key === 's' || e.key === 'S') {
        if (state.isRunning) {
            e.preventDefault();
            completeSession(true);
        }
    }
});
