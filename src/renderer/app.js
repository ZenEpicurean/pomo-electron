'use strict';

// ---------------------------------------------------------------------------
// app.js -- the "glue" between the TimerEngine and the DOM.
//
// Responsibilities:
//   * read settings from the config form and configure/start the engine
//   * render the engine's snapshot into the page every tick
//   * wire up buttons and keyboard shortcuts
//   * play a beep when a segment completes (Web Audio -- no sound file needed)
//
// Wrapped in an IIFE so its top-level names don't collide with engine.js in
// the shared global scope of classic <script> files.
// ---------------------------------------------------------------------------
(function () {

const Phase = window.PomoPhase;
const SegType = window.PomoSegType;

// ---- tiny DOM helpers ----
const $ = (sel) => document.querySelector(sel);
const show = (el) => el.removeAttribute('hidden');
const hide = (el) => el.setAttribute('hidden', '');

// ---- format ms -> HH:MM:SS ----
function fmt(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// Human-friendly duration for the stats view: "3h 20m", "45m", or "0m".
function fmtHuman(ms) {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

// Compact clock for the big headline timer: drop the hours field when under
// an hour so a 25-minute segment reads "25:00", not "00:25:00".
function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total >= 3600) return fmt(ms);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ---- beep via Web Audio (a short two-tone chime) ----
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch (e) {
    // Audio may be unavailable; ignore silently.
  }
}

// ---- icons for the cycle visualization ----
function segIcon(type) {
  if (type === SegType.WORK) return '🍅';
  if (type === SegType.LONG) return '🌙';
  return '☕';
}

// ---------------------------------------------------------------------------
// Create the engine. Its onUpdate callback drives all rendering.
// ---------------------------------------------------------------------------
const engine = new window.TimerEngine(render, beep);

// ---------------------------------------------------------------------------
// Focus-stats tracking. We derive activity from the engine snapshots rather
// than reaching into the engine: whenever the work-hours countdown drops, that
// delta is focused-work time; a work segment reaching the gate is a completed
// session. PomoStats persists both to localStorage.
// ---------------------------------------------------------------------------
let lastWorkRemaining = null;
let prevPhase = null;
function trackStats(s) {
  if (!window.PomoStats) return;
  if (
    lastWorkRemaining != null &&
    s.workHoursRemainingMs != null &&
    s.workHoursRemainingMs < lastWorkRemaining
  ) {
    const levelUp = window.PomoStats.addWork(lastWorkRemaining - s.workHoursRemainingMs);
    if (levelUp) showToast('⚔ ' + levelUp.name + ' reached Level ' + levelUp.toLevel + '!');
  }
  lastWorkRemaining = s.workHoursRemainingMs;

  if (
    prevPhase === Phase.RUNNING &&
    s.phase === Phase.GATE &&
    s.segment &&
    s.segment.countsAsWork
  ) {
    window.PomoStats.addSession();
  }
  prevPhase = s.phase;
}

// Brief level-up notification.
let toastTimer = null;
function showToast(text) {
  const el = $('#levelup-toast');
  if (!el) return;
  el.textContent = text;
  show(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el), 3500);
}

// Live active-skill banner on the timer screen.
function renderSkillBanner() {
  const banner = $('#skill-banner');
  const sk = window.PomoStats && window.PomoStats.activeSkill();
  if (!sk) {
    hide(banner);
    return;
  }
  $('#skill-banner-name').textContent = sk.name;
  $('#skill-banner-level').textContent = 'Lv ' + sk.level;
  $('#skill-banner-xp').style.width = Math.round(sk.pct * 100) + '%';
  $('#skill-banner-xptext').textContent = sk.intoLevel + ' / ' + sk.span + ' XP  ·  ' + sk.toNext + ' to next';
  show(banner);
}

function render(s) {
  trackStats(s);

  // Pick which screen is visible based on the engine phase.
  const onConfig = s.phase === Phase.IDLE;
  const onDone = s.phase === Phase.DONE;
  const onTimer = s.phase === Phase.RUNNING || s.phase === Phase.GATE;

  toggleScreen('#config-screen', onConfig);
  toggleScreen('#timer-screen', onTimer);
  toggleScreen('#done-screen', onDone);

  if (!onTimer) return;

  renderSkillBanner();

  const seg = s.segment;

  // Segment label + big timer.
  $('#segment-label').textContent = seg ? seg.label : '';

  if (s.hideSegmentTimer) {
    $('#big-time').textContent = '––:––';
  } else {
    $('#big-time').textContent = fmtClock(seg ? seg.remainingMs : 0);
  }

  // Paused badge (shown if either pause affecting this view is active).
  const pausedBadge = $('#paused-badge');
  if (s.segmentPaused) show(pausedBadge);
  else hide(pausedBadge);

  // Segment progress bar.
  const segRatio = seg && seg.totalMs > 0 ? 1 - seg.remainingMs / seg.totalMs : 0;
  $('#segment-bar-fill').style.width = clampPct(segRatio);
  $('#segment-bar-fill').style.background =
    seg && seg.type === SegType.WORK ? 'var(--work)' : 'var(--break)';

  // Work-hours readout.
  $('#work-left').textContent =
    fmt(s.workHoursRemainingMs) + (s.workdayPaused ? '  ⏸' : '');
  const workNote = $('#work-note');
  if (seg && !seg.countsAsWork) {
    workNote.textContent = 'not counting during breaks';
  } else if (s.workHoursRemainingMs <= 0) {
    workNote.textContent = 'complete — wrapping up';
  } else {
    workNote.textContent = '';
  }

  // Work-day progress bar.
  const workRatio =
    s.totalWorkMs > 0 ? 1 - s.workHoursRemainingMs / s.totalWorkMs : 1;
  $('#workday-bar-fill').style.width = clampPct(workRatio);
  $('#workday-pct').textContent = Math.round(clamp01(workRatio) * 100) + '%';

  // Cycle visualization row.
  renderCycleRow(s);

  // Preset info line.
  const presetInfo = $('#preset-info');
  if (s.cfg && s.cfg.presetInfoLine) {
    presetInfo.textContent = s.cfg.presetInfoLine;
    show(presetInfo);
  } else {
    hide(presetInfo);
  }

  // Toggle control button "active" styling.
  setActive('[data-action="segment"]', s.segmentPaused);
  setActive('[data-action="workday"]', s.workdayPaused);
  setActive('[data-action="both"]', s.segmentPaused && s.workdayPaused);
  setActive('[data-action="hide"]', s.hideSegmentTimer);

  // Gate vs running controls.
  const atGate = s.phase === Phase.GATE;
  toggleEl('#gate-controls', atGate);
  toggleEl('#running-controls', !atGate);
}

function renderCycleRow(s) {
  const row = $('#cycle-row');
  row.innerHTML = '';
  s.cyclePattern.forEach((cell, i) => {
    const div = document.createElement('span');
    div.className = 'cycle-cell';
    if (i <= s.phaseIndex) div.classList.add('reached');
    if (i === s.phaseIndex) div.classList.add('current');
    div.textContent = i <= s.phaseIndex ? segIcon(cell.type) : '·';
    row.appendChild(div);
  });
}

// ---- small render utilities ----
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function clampPct(x) {
  return Math.round(clamp01(x) * 100) + '%';
}
function toggleScreen(sel, visible) {
  const el = $(sel);
  if (visible) show(el);
  else hide(el);
}
function toggleEl(sel, visible) {
  const el = $(sel);
  if (visible) show(el);
  else hide(el);
}
function setActive(sel, active) {
  const el = $(sel);
  if (!el) return;
  el.classList.toggle('active', !!active);
}

// ---------------------------------------------------------------------------
// Config form -> start
// ---------------------------------------------------------------------------
function readSettings() {
  const val = (sel) => $(sel).value.trim();
  const presetRaw = val('#in-preset');
  return {
    workMin: parseFloat(val('#in-work')),
    totalHrs: parseFloat(val('#in-total')),
    breakMin: parseFloat(val('#in-break')),
    longMin: parseFloat(val('#in-long')),
    cycles: parseInt(val('#in-cycles'), 10),
    preset: presetRaw === '' ? null : parseFloat(presetRaw),
  };
}

$('#btn-start').addEventListener('click', () => {
  const err = $('#config-error');
  hide(err);
  try {
    engine.configure(readSettings());
    engine.start();
  } catch (e) {
    err.textContent = e.message;
    show(err);
  }
});

// ---------------------------------------------------------------------------
// Control buttons (event delegation via data-action).
// ---------------------------------------------------------------------------
const actions = {
  segment: () => engine.toggleSegmentPause(),
  workday: () => engine.toggleWorkdayPause(),
  both: () => engine.toggleBothPause(),
  skip: () => engine.skip(),
  hide: () => engine.toggleHideSegment(),
  continue: () => engine.continueNext(),
  reset: () => engine.reset(),
};

document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action];
  if (fn) fn();
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts (match the CLI: s / w / b / k / h / c, plus Space).
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  // Don't hijack typing in the config inputs.
  if (e.target.tagName === 'INPUT') return;

  const snap = engine.snapshot();
  const running = snap.phase === Phase.RUNNING;
  const gate = snap.phase === Phase.GATE;

  switch (e.key.toLowerCase()) {
    case 's':
      if (running || gate) engine.toggleSegmentPause();
      break;
    case 'w':
      if (running || gate) engine.toggleWorkdayPause();
      break;
    case 'b':
      if (running || gate) engine.toggleBothPause();
      break;
    case 'k':
      if (running) engine.skip();
      break;
    case 'h':
      if (running || gate) engine.toggleHideSegment();
      break;
    case 'c':
    case ' ':
      if (gate) {
        e.preventDefault();
        engine.continueNext();
      }
      break;
  }
});

// ---------------------------------------------------------------------------
// Footer version (via the preload bridge). Optional/defensive.
// ---------------------------------------------------------------------------
if (window.pomo && window.pomo.getVersion) {
  window.pomo
    .getVersion()
    .then((v) => {
      $('#version').textContent = 'v' + v;
    })
    .catch(() => {
      $('#version').textContent = '';
    });
}

// ---------------------------------------------------------------------------
// "What's New" modal — shows CHANGELOG.md (fetched from the main process).
// ---------------------------------------------------------------------------
const changelogModal = $('#changelog-modal');

// Escape HTML, then apply the tiny bit of inline formatting we author (**bold**).
function inlineMd(text) {
  const esc = text.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Minimal Markdown -> HTML for the changelog subset we write (##, ###, - ).
// Skips the file's title/preamble (everything before the first "## ").
function renderChangelog(md) {
  const lines = md.split(/\r?\n/);
  let html = '';
  let inList = false;
  let started = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      started = true; closeList();
      html += '<h3>' + inlineMd(line.slice(3)) + '</h3>';
    } else if (!started) {
      continue;
    } else if (line.startsWith('### ')) {
      closeList();
      html += '<h4>' + inlineMd(line.slice(4)) + '</h4>';
    } else if (/^\s*-\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inlineMd(line.replace(/^\s*-\s+/, '')) + '</li>';
    } else if (line !== '') {
      closeList();
      html += '<p>' + inlineMd(line) + '</p>';
    }
  }
  closeList();
  return html;
}

function openChangelog() {
  if (!(window.pomo && window.pomo.getChangelog)) return;
  window.pomo.getChangelog().then((md) => {
    $('#changelog-body').innerHTML = md
      ? renderChangelog(md)
      : '<p>No changelog available.</p>';
    show(changelogModal);
  }).catch(() => {});
}
function closeChangelog() { hide(changelogModal); }

if (window.pomo && window.pomo.getChangelog) {
  show($('#whats-new'));
  $('#whats-new').addEventListener('click', openChangelog);
  $('#changelog-close').addEventListener('click', closeChangelog);
  changelogModal.addEventListener('click', (e) => {
    if (e.target === changelogModal) closeChangelog();
  });
}

// ---------------------------------------------------------------------------
// "Your focus stats" modal — reads from PomoStats (localStorage).
// ---------------------------------------------------------------------------
const statsModal = $('#stats-modal');

function renderStats() {
  const st = window.PomoStats;
  if (!st) return;
  const week = st.thisWeek();
  $('#stat-week-time').textContent = fmtHuman(week.workMs);
  $('#stat-week-sessions').textContent =
    week.sessions + (week.sessions === 1 ? ' session' : ' sessions');

  const recent = st.recentWeeks(8);
  const maxMs = Math.max(1, ...recent.map((w) => w.workMs));
  const container = $('#stat-weeks');
  if (recent.length === 0) {
    container.innerHTML = '<div class="stat-weeks-empty">No focused time recorded yet — start a session!</div>';
  } else {
    container.innerHTML = recent
      .map((w) => {
        const pct = Math.round((w.workMs / maxMs) * 100);
        return (
          '<div class="stat-week-row">' +
          '<span class="wk">' + w.week + '</span>' +
          '<span class="bar"><span class="bar-fill work" style="width:' + pct + '%"></span></span>' +
          '<span class="val">' + fmtHuman(w.workMs) + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  const life = st.lifetime();
  $('#stat-lifetime-time').textContent = fmtHuman(life.workMs);
  $('#stat-lifetime-sessions').textContent =
    life.sessions + (life.sessions === 1 ? ' session' : ' sessions');
}

function openStats() { renderStats(); show(statsModal); }
function closeStats() { hide(statsModal); }

$('#open-stats').addEventListener('click', openStats);
$('#stats-close').addEventListener('click', closeStats);
statsModal.addEventListener('click', (e) => {
  if (e.target === statsModal) closeStats();
});

// ---------------------------------------------------------------------------
// Skills / XP — activity picker + "character sheet" modal.
// ---------------------------------------------------------------------------
const skillsModal = $('#skills-modal');

// Populate the config-screen "Activity" dropdown from the saved skills.
function refreshActivitySelect() {
  const sel = $('#activity-select');
  if (!sel || !window.PomoStats) return;
  const skills = window.PomoStats.skills();
  const activeId = window.PomoStats.getActiveSkillId();
  sel.innerHTML = skills
    .map(
      (s) =>
        '<option value="' + s.id + '"' + (s.id === activeId ? ' selected' : '') + '>' +
        escapeHtmlText(s.name) + ' (Lv ' + s.level + ')</option>'
    )
    .join('');
  if (skills.length === 0) {
    sel.innerHTML = '<option value="">No skills — add one ▸</option>';
  }
}

function escapeHtmlText(t) {
  return String(t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

$('#activity-select').addEventListener('change', (e) => {
  if (e.target.value) window.PomoStats.setActiveSkill(e.target.value);
});

// Render the character-sheet list of skills with levels + XP bars.
function renderSkillsList() {
  const list = $('#skills-list');
  if (!window.PomoStats) return;
  const skills = window.PomoStats.skills();
  const activeId = window.PomoStats.getActiveSkillId();
  if (skills.length === 0) {
    list.innerHTML = '<div class="stat-weeks-empty">No skills yet — add one below.</div>';
    return;
  }
  list.innerHTML = skills
    .map((s) => {
      const isActive = s.id === activeId;
      const activeCtrl = isActive
        ? '<span class="active-tag">● active</span>'
        : '<button class="set-active" data-skill="' + s.id + '">Set active</button>';
      return (
        '<div class="skill-row' + (isActive ? ' active' : '') + '">' +
        '<div class="skill-row-head">' +
        '<span class="skill-row-name">' + escapeHtmlText(s.name) + '</span>' +
        '<span class="skill-level">Lv ' + s.level + '</span>' +
        '<span class="skill-row-actions">' + activeCtrl +
        '<button class="del-skill" data-skill="' + s.id + '" title="Delete">✕</button>' +
        '</span></div>' +
        '<span class="xp-bar"><span class="xp-fill" style="width:' + Math.round(s.pct * 100) + '%"></span></span>' +
        '<div class="skill-row-xptext"><span>' + s.xp + ' XP · ' + fmtHuman(s.focusMs) + ' focused</span>' +
        '<span>' + s.toNext + ' to Lv ' + (s.level + 1) + '</span></div>' +
        '</div>'
      );
    })
    .join('');
}

function afterSkillChange() {
  renderSkillsList();
  refreshActivitySelect();
  if (engine.snapshot().phase !== Phase.IDLE) renderSkillBanner();
}

// Show the reset link, hide the "are you sure?" confirm row.
function resetConfirmState() {
  show($('#reset-skills'));
  hide($('#reset-confirm'));
}
function openSkills() { resetConfirmState(); renderSkillsList(); show(skillsModal); }
function closeSkills() { hide(skillsModal); }

$('#open-skills').addEventListener('click', openSkills);
$('#manage-skills').addEventListener('click', openSkills);
$('#skills-close').addEventListener('click', closeSkills);
skillsModal.addEventListener('click', (e) => {
  if (e.target === skillsModal) closeSkills();
});

// Add skill.
function submitNewSkill() {
  const input = $('#new-skill-name');
  const id = window.PomoStats.addSkill(input.value);
  if (id) {
    input.value = '';
    window.PomoStats.setActiveSkill(id);
    afterSkillChange();
  }
}
$('#add-skill-btn').addEventListener('click', submitNewSkill);
$('#new-skill-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitNewSkill();
  }
});

// Set-active / delete via event delegation inside the skills list.
$('#skills-list').addEventListener('click', (e) => {
  const setBtn = e.target.closest('.set-active');
  const delBtn = e.target.closest('.del-skill');
  if (setBtn) {
    window.PomoStats.setActiveSkill(setBtn.dataset.skill);
    afterSkillChange();
  } else if (delBtn) {
    window.PomoStats.deleteSkill(delBtn.dataset.skill);
    afterSkillChange();
  }
});

// Reset skill progress (two-step confirm).
$('#reset-skills').addEventListener('click', () => {
  hide($('#reset-skills'));
  show($('#reset-confirm'));
});
$('#reset-no').addEventListener('click', resetConfirmState);
$('#reset-yes').addEventListener('click', () => {
  window.PomoStats.resetSkillProgress();
  afterSkillChange();
  resetConfirmState();
});

// Escape closes whichever modal is open.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeChangelog();
    closeStats();
    closeSkills();
  }
});

// Initial paint (config screen) + populate the activity picker.
refreshActivitySelect();
render(engine.snapshot());

})();
