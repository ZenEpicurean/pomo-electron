'use strict';

// ---------------------------------------------------------------------------
// PomoStats — local persistence of focus statistics.
//
// Stores a single JSON object in localStorage. Because localStorage lives in
// Electron's userData folder (%APPDATA%\Pomo Electron on Windows), this data
// survives app updates — downloading a new version does NOT wipe it.
//
// The shape is intentionally a plain, self-describing JSON object so it can
// later be (a) extended for gamification — streaks, badges, goals — and
// (b) serialized straight to a server for cross-device sync. `schema` lets us
// migrate the format safely down the road.
//
//   {
//     schema: 1,
//     weeks: { "2026-W27": { workMs, sessions } , ... },   // ISO week buckets
//     lifetime: { workMs, sessions },
//     updatedAt: "<ISO timestamp>"
//   }
// ---------------------------------------------------------------------------
(function () {
  const KEY = 'pomo.stats.v1';

  // ISO-8601 week key for a date, e.g. "2026-W27". Uses local date parts so a
  // week lines up with the user's own calendar.
  function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // move to Thursday of this week
    const thursday = d.getTime();
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); // Jan 4 is always in week 1
    const ys = (yearStart.getUTCDay() + 6) % 7;
    yearStart.setUTCDate(yearStart.getUTCDate() - ys + 3);
    const week = 1 + Math.round((thursday - yearStart.getTime()) / (7 * 24 * 3600 * 1000));
    return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function emptyData() {
    return { schema: 1, weeks: {}, lifetime: { workMs: 0, sessions: 0 }, updatedAt: null };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.weeks && parsed.lifetime) return parsed;
      }
    } catch (e) {
      /* corrupt or unavailable — fall back to empty */
    }
    return emptyData();
  }

  const Stats = {
    data: load(),

    _save() {
      try {
        this.data.updatedAt = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        /* storage full/blocked — ignore, tracking is best-effort */
      }
    },

    _weekBucket(key) {
      if (!this.data.weeks[key]) this.data.weeks[key] = { workMs: 0, sessions: 0 };
      return this.data.weeks[key];
    },

    // Add elapsed focused-work milliseconds to the current week + lifetime.
    addWork(ms) {
      if (!(ms > 0)) return;
      this._weekBucket(isoWeekKey(new Date())).workMs += ms;
      this.data.lifetime.workMs += ms;
      this._save();
    },

    // Record one completed work session.
    addSession() {
      this._weekBucket(isoWeekKey(new Date())).sessions += 1;
      this.data.lifetime.sessions += 1;
      this._save();
    },

    thisWeek() {
      return this.data.weeks[isoWeekKey(new Date())] || { workMs: 0, sessions: 0 };
    },

    // Most recent N weeks that have data, newest first.
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
  window.pomoIsoWeekKey = isoWeekKey; // exposed for tests
})();
