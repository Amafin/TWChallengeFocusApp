let token = localStorage.getItem('token');
let currentSession = JSON.parse(localStorage.getItem('currentSession') || 'null');
let timerInterval = null;

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers
    }
  }).then(r => r.json());
}

async function handleAuth(mode) {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const res = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) });
  if (res.token) {
    token = res.token;
    localStorage.setItem('token', token);
    initApp();
  } else {
    alert(res.error || 'Erreur');
  }
}

function logout() {
  localStorage.clear();
  location.reload();
}

// Vérité temporelle calculée depuis startedAt
function syncTimerDisplay() {
  if (!currentSession) return;

  let remainingSec;

  if (currentSession.isPaused) {
    // Si en pause, on utilise la valeur gelée
    remainingSec = currentSession.pausedRemainingSec;
  } else {
    // Vérité serveur : dérivée de startedAt
    const started = new Date(currentSession.startedAt).getTime();
    const plannedSec = currentSession.plannedMinutes * 60;
    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    remainingSec = Math.max(0, plannedSec - elapsedSec);
  }

  const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
  const s = (remainingSec % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').innerText = `${m}:${s}`;

  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) {
    const isFinished = remainingSec === 0;
    finishBtn.disabled = !isFinished;
    finishBtn.style.opacity = isFinished ? '1' : '0.5';
    finishBtn.innerText = isFinished ? 'Terminer' : `Terminer (${m}:${s})`;
  }

  if (remainingSec === 0 && !currentSession.isPaused) {
    terminateSession('completed');
  }
}

function togglePause() {
  if (!currentSession) return;

  const pauseBtn = document.getElementById('pause-btn');

  if (!currentSession.isPaused) {
    // METTRE EN PAUSE : on gèle le temps restant
    const started = new Date(currentSession.startedAt).getTime();
    const plannedSec = currentSession.plannedMinutes * 60;
    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    
    currentSession.pausedRemainingSec = Math.max(0, plannedSec - elapsedSec);
    currentSession.isPaused = true;
    
    clearInterval(timerInterval);
    pauseBtn.innerText = 'Reprendre';
  } else {
    // REPRENDRE : on recalcule un startedAt cohérent
    const plannedSec = currentSession.plannedMinutes * 60;
    const newElapsedSec = plannedSec - currentSession.pausedRemainingSec;
    
    currentSession.startedAt = new Date(Date.now() - newElapsedSec * 1000).toISOString();
    currentSession.isPaused = false;
    delete currentSession.pausedRemainingSec;

    pauseBtn.innerText = 'Mettre en pause';
    timerInterval = setInterval(syncTimerDisplay, 1000);
  }

  localStorage.setItem('currentSession', JSON.stringify(currentSession));
  syncTimerDisplay();
}

async function startSession() {
  const label = document.getElementById('session-label').value || 'Focus';
  const tags = document.getElementById('session-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const plannedMinutes = parseInt(document.getElementById('session-minutes').value, 10);

  const session = await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ label, tags, plannedMinutes })
  });

  currentSession = session;
  localStorage.setItem('currentSession', JSON.stringify(currentSession));
  renderSessionUI();
}

async function terminateSession(status) {
  if (!currentSession) return;
  await api(`/api/sessions/${currentSession.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  clearInterval(timerInterval);
  currentSession = null;
  localStorage.removeItem('currentSession');
  document.getElementById('timer-display').innerText = "25:00";
  renderSessionUI();
  refreshStats();
  loadHistory();
}

async function bumpDistraction() {
  if (!currentSession) return;
  const res = await api(`/api/sessions/${currentSession.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ distractionIncrement: 1 })
  });
  
  if (res.distractionCount !== undefined) {
    currentSession.distractionCount = res.distractionCount;
    localStorage.setItem('currentSession', JSON.stringify(currentSession));
    document.getElementById('current-distractions').innerText = currentSession.distractionCount;
  }
}

function renderSessionUI() {
  const active = Boolean(currentSession);
  document.getElementById('session-setup').classList.toggle('hidden', active);
  document.getElementById('session-controls').classList.toggle('hidden', !active);

  if (active) {
    document.getElementById('current-distractions').innerText = currentSession.distractionCount || 0;
    
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.innerText = currentSession.isPaused ? 'Reprendre' : 'Mettre en pause';
    }

    syncTimerDisplay();
    clearInterval(timerInterval);
    if (!currentSession.isPaused) {
      timerInterval = setInterval(syncTimerDisplay, 1000);
    }
  }
}

async function refreshStats() {
  const data = await api('/api/stats');
  document.getElementById('stat-minutes').innerText = data.todayMinutes;
  document.getElementById('stat-streak').innerText = data.streak;
}

async function loadHistory() {
  const search = document.getElementById('search-input').value;
  const list = await api(`/api/sessions?search=${encodeURIComponent(search)}`);
  const ul = document.getElementById('history-list');
  ul.innerHTML = list.map(s => `
    <li>
      <b>${s.label}</b> - ${s.plannedMinutes}m [${s.status}]
      <br>
      <small>${new Date(s.startedAt).toLocaleDateString()} — Distractions : <b>${s.distractionCount}</b></small>
      <br>
      <span>Tags: ${s.tags.join(', ')}</span>
    </li>
  `).join('');
}

function initApp() {
  if (!token) return;
  document.getElementById('auth-panel').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderSessionUI();
  refreshStats();
  loadHistory();
}

initApp();