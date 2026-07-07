'use strict';

// ---------------------------------------------------------------------------
// PomoStats — local persistence of focus statistics AND the RPG progression.
//
// One JSON object in localStorage (userData-backed, so it survives updates):
//
//   {
//     schema: 2,
//     skills: { "coding": { name: "Coding", focusMs }, ... },  // XP source
//     activeSkillId: "coding",   // the skill the current session earns XP for
//     weeks: { "2026-W28": { workMs, sessions } , ... },       // weekly focus
//     lifetime: { workMs, sessions },
//     updatedAt: "<ISO>"
//   }
//
// XP/level are DERIVED from each skill's focusMs (no stored floats to drift):
//   * 10 XP per focused minute  (1 XP per 6 seconds)
//   * level L→L+1 costs 100*L XP, i.e. 10*L minutes  (L1→2 = 10 min, L2→3 = 20 …)
//
// The shape is deliberately plain JSON so it can later grow gamification
// (streaks, badges, goals) and be POSTed to a server for cross-device sync.
// `schema` lets us migrate the format safely.
// ---------------------------------------------------------------------------
(function () {
  const KEY = 'pomo.stats.v1'; // storage key kept stable; `schema` tracks format
  const XP_MS_PER_POINT = 6000; // 6s of focus = 1 XP  => 10 XP / minute

  // --- ISO week key (local calendar), e.g. "2026-W28" ---
  function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const thursday = d.getTime();
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const ys = (yearStart.getUTCDay() + 6) % 7;
    yearStart.setUTCDate(yearStart.getUTCDate() - ys + 3);
    const week = 1 + Math.round((thursday - yearStart.getTime()) / (7 * 24 * 3600 * 1000));
    return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  // --- XP / level math ---
  function xpFromMs(ms) { return Math.floor(ms / XP_MS_PER_POINT); }
  function cumXpForLevel(L) { return 50 * L * (L - 1); } // total XP to REACH level L (L1 = 0)
  function levelInfo(xp) {
    let L = 1;
    while (cumXpForLevel(L + 1) <= xp) L++;
    const base = cumXpForLevel(L);
    const next = cumXpForLevel(L + 1);
    const span = next - base;
    return {
      level: L,
      xp: xp,
      intoLevel: xp - base,
      span: span,
      toNext: next - xp,
      pct: span > 0 ? Math.max(0, Math.min(1, (xp - base) / span)) : 0,
    };
  }

  function slugify(name) {
    return (
      String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
      'skill'
    );
  }

  function emptyData() {
    return {
      schema: 2,
      skills: {},
      activeSkillId: null,
      weeks: {},
      lifetime: { workMs: 0, sessions: 0 },
      updatedAt: null,
    };
  }

  // Bring any older/partial object up to the current shape.
  function migrate(data) {
    if (!data.skills) data.skills = {};
    if (!data.weeks) data.weeks = {};
    if (!data.lifetime) data.lifetime = { workMs: 0, sessions: 0 };
    if (Object.keys(data.skills).length === 0) {
      ['Coding', 'Exercise'].forEach((n) => {
        data.skills[slugify(n)] = { name: n, focusMs: 0 };
      });
    }
    if (!data.activeSkillId || !data.skills[data.activeSkillId]) {
      data.activeSkillId = Object.keys(data.skills)[0] || null;
    }
    data.schema = 2;
    return data;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') return migrate(p);
      }
    } catch (e) {
      /* corrupt/unavailable — fall through */
    }
    return migrate(emptyData());
  }

  const Stats = {
    data: load(),

    _save() {
      try {
        this.data.updatedAt = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        /* best-effort */
      }
    },

    _weekBucket(key) {
      if (!this.data.weeks[key]) this.data.weeks[key] = { workMs: 0, sessions: 0 };
      return this.data.weeks[key];
    },

    _skillView(id) {
      const s = this.data.skills[id];
      if (!s) return null;
      const info = levelInfo(xpFromMs(s.focusMs));
      return {
        id: id,
        name: s.name,
        focusMs: s.focusMs,
        xp: info.xp,
        level: info.level,
        intoLevel: info.intoLevel,
        span: info.span,
        toNext: info.toNext,
        pct: info.pct,
      };
    },

    // ---- skills ----
    addSkill(name) {
      name = String(name || '').trim().slice(0, 24);
      if (!name) return null;
      let id = slugify(name);
      const base = id;
      let i = 2;
      while (this.data.skills[id]) id = base + '-' + i++;
      this.data.skills[id] = { name: name, focusMs: 0 };
      if (!this.data.activeSkillId) this.data.activeSkillId = id;
      this._save();
      return id;
    },
    deleteSkill(id) {
      if (!this.data.skills[id]) return;
      delete this.data.skills[id];
      if (this.data.activeSkillId === id) {
        this.data.activeSkillId = Object.keys(this.data.skills)[0] || null;
      }
      this._save();
    },
    setActiveSkill(id) {
      if (this.data.skills[id]) {
        this.data.activeSkillId = id;
        this._save();
      }
    },
    // Zero every skill's XP/level (keeps the skills themselves and their names).
    resetSkillProgress() {
      Object.keys(this.data.skills).forEach((id) => {
        this.data.skills[id].focusMs = 0;
      });
      this._save();
    },
    getActiveSkillId() {
      return this.data.activeSkillId;
    },
    activeSkill() {
      return this.data.activeSkillId ? this._skillView(this.data.activeSkillId) : null;
    },
    skills() {
      return Object.keys(this.data.skills)
        .map((id) => this._skillView(id))
        .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    },

    // ---- work crediting ----
    // Adds focused-work ms to weekly/lifetime totals AND the active skill.
    // Returns a level-up descriptor { id, name, fromLevel, toLevel } or null.
    addWork(ms) {
      if (!(ms > 0)) return null;
      this._weekBucket(isoWeekKey(new Date())).workMs += ms;
      this.data.lifetime.workMs += ms;

      let levelUp = null;
      const s = this.data.skills[this.data.activeSkillId];
      if (s) {
        const before = levelInfo(xpFromMs(s.focusMs)).level;
        s.focusMs += ms;
        const after = levelInfo(xpFromMs(s.focusMs)).level;
        if (after > before) {
          levelUp = { id: this.data.activeSkillId, name: s.name, fromLevel: before, toLevel: after };
        }
      }
      this._save();
      return levelUp;
    },
    addSession() {
      this._weekBucket(isoWeekKey(new Date())).sessions += 1;
      this.data.lifetime.sessions += 1;
      this._save();
    },

    thisWeek() {
      return this.data.weeks[isoWeekKey(new Date())] || { workMs: 0, sessions: 0 };
    },
    recentWeeks(n) {
      return Object.keys(this.data.weeks)
        .sort()
        .reverse()
        .slice(0, n || 8)
        .map((week) => ({ week, ...this.data.weeks[week] }));
    },
    lifetime() {
      return this.data.lifetime;
    },
  };

  window.PomoStats = Stats;
  window.pomoLevelInfo = levelInfo; // exposed for tests
  window.pomoIsoWeekKey = isoWeekKey;
})();
