'use strict';

// Wrapped in an IIFE so top-level names (Phase, SegType, helpers) stay private
// to this file. Classic <script> files share ONE global scope, so leaking a
// `const Phase` here would collide with app.js's own `Phase`. Only the
// window.* assignments at the bottom are intentionally exposed.
(function () {

// ---------------------------------------------------------------------------
// TimerEngine -- the Pomodoro logic, ported from the original CLI script.
//
// This class has NO knowledge of the DOM. It just holds state, ticks once per
// second, and calls an `onUpdate` callback so the UI can redraw. Keeping the
// logic separate from the UI makes it easy to reason about (and to test).
//
// Concepts carried over from the CLI:
//   * A session is made of WORK segments and BREAK segments (short / long).
//   * You set a total number of WORK hours to complete. Breaks never count
//     against that budget.
//   * The "segment" countdown and the "work-hours" countdown can be paused
//     independently (keys s / w / b in the CLI).
//   * When a segment finishes, we STOP and wait for the user to continue
//     (the "gate"), matching the CLI's "press c to continue".
// ---------------------------------------------------------------------------

// Phases of the engine's own state machine.
const Phase = Object.freeze({
  IDLE: 'idle',       // configured but not started (or finished + reset)
  RUNNING: 'running', // a segment is actively counting down
  GATE: 'gate',       // a segment just finished; waiting for "continue"
  DONE: 'done',       // all work hours complete
});

// Segment types.
const SegType = Object.freeze({
  WORK: 'work',
  SHORT: 'short',
  LONG: 'long',
});

/**
 * Given raw user settings, compute the effective config. This mirrors the
 * CLI's argument handling, including "preset" mode.
 *
 * @param {object} raw - { workMin, breakMin, longMin, cycles, totalHrs, preset }
 *                       `preset` may be null/NaN to disable preset mode.
 * @returns {object} effective config plus an optional `presetInfoLine`.
 */
function resolveConfig(raw) {
  const workMin = num(raw.workMin, 25);
  const totalHrs = num(raw.totalHrs, 8);

  let breakMin = num(raw.breakMin, 5);
  let longMin = num(raw.longMin, 15);
  let cycles = Math.max(1, Math.round(num(raw.cycles, 4)));

  const preset = raw.preset;
  const hasPreset = preset !== null && preset !== undefined && !Number.isNaN(preset);

  let presetInfoLine = null;

  if (hasPreset) {
    const breakBudgetMin = (preset - totalHrs) * 60;
    if (breakBudgetMin < 0) {
      throw new Error(
        `Preset (${preset}h) must be >= total work hours (${totalHrs}h).`
      );
    }

    const numWorkSessions = Math.max(1, Math.ceil((totalHrs * 60) / workMin));
    const numBreaks = Math.max(0, numWorkSessions - 1);
    const breakEachMin = numBreaks > 0 ? breakBudgetMin / numBreaks : 0;

    breakMin = breakEachMin;
    longMin = breakEachMin; // uniform breaks in preset mode
    cycles = numWorkSessions;

    presetInfoLine =
      `Preset: ${preset}h total = ${totalHrs}h work + ` +
      `${(breakBudgetMin / 60).toFixed(2)}h breaks, ~${breakEachMin.toFixed(1)}m ` +
      `across ${numBreaks} break(s).`;
  }

  return { workMin, breakMin, longMin, cycles, totalHrs, presetInfoLine };
}

function num(v, def) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

class TimerEngine {
  /**
   * @param {(state: object) => void} onUpdate - called every tick and on any
   *        state change, with a snapshot for the UI to render.
   * @param {() => void} [onSegmentComplete] - called once when a segment ends
   *        (used to play the beep). Optional.
   */
  constructor(onUpdate, onSegmentComplete) {
    this.onUpdate = onUpdate || (() => {});
    this.onSegmentComplete = onSegmentComplete || (() => {});

    this.phase = Phase.IDLE;
    this._interval = null;
    this._configured = false;

    // Pause / view flags (CLI: s / w / b / h).
    this.segmentPaused = false;
    this.workdayPaused = false;
    this.hideSegmentTimer = false;

    this._resetRuntime();
  }

  _resetRuntime() {
    this.cfg = null;
    this.totalWorkMs = 0;
    this.workHoursRemainingMs = 0;
    this.cycleCount = 0;
    this.cyclePattern = [];
    this.phaseIndex = 0;
    this.segment = null; // { label, type, totalMs, remainingMs, countsAsWork }
  }

  /** Apply settings and get ready to start. Does not begin counting. */
  configure(rawSettings) {
    this.cfg = resolveConfig(rawSettings);

    this.totalWorkMs = this.cfg.totalHrs * 3600 * 1000;
    this.workHoursRemainingMs = this.totalWorkMs;
    this.cycleCount = 0;
    this.phaseIndex = 0;

    // Build the visualization pattern:
    // e.g. cycles=4 -> [work, short, work, short, work, short, work, long]
    this.cyclePattern = [];
    for (let i = 1; i <= this.cfg.cycles; i++) {
      this.cyclePattern.push({ type: SegType.WORK });
      this.cyclePattern.push({
        type: i === this.cfg.cycles ? SegType.LONG : SegType.SHORT,
      });
    }

    this.segmentPaused = false;
    this.workdayPaused = false;
    this.hideSegmentTimer = false;
    this.phase = Phase.IDLE;
    this._configured = true;
    this._emit();
  }

  /** Begin the session (first work segment). */
  start() {
    if (!this._configured) return;
    this._beginWorkSession();
    this._runTicker();
  }

  _beginWorkSession() {
    this.cycleCount += 1;
    this.segment = {
      label: `Work Session #${this.cycleCount}`,
      type: SegType.WORK,
      totalMs: this.cfg.workMin * 60 * 1000,
      remainingMs: this.cfg.workMin * 60 * 1000,
      countsAsWork: true,
    };
    this.phase = Phase.RUNNING;
    this._emit();
  }

  _beginBreak(isLong) {
    const minutes = isLong ? this.cfg.longMin : this.cfg.breakMin;
    this.segment = {
      label: isLong ? 'Long Break' : 'Short Break',
      type: isLong ? SegType.LONG : SegType.SHORT,
      totalMs: minutes * 60 * 1000,
      remainingMs: minutes * 60 * 1000,
      countsAsWork: false,
    };
    this.phase = Phase.RUNNING;
    this._emit();
  }

  _runTicker() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), 1000);
  }

  _stopTicker() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _tick() {
    if (this.phase !== Phase.RUNNING || !this.segment) return;

    // Decrement the segment timer unless it's paused.
    if (!this.segmentPaused) {
      this.segment.remainingMs -= 1000;
    }

    // Decrement the work-hours budget only during work, unless paused.
    if (this.segment.countsAsWork && !this.workdayPaused) {
      this.workHoursRemainingMs = Math.max(0, this.workHoursRemainingMs - 1000);
    }

    if (this.segment.remainingMs <= 0) {
      this.segment.remainingMs = 0;
      this._completeSegment();
      return;
    }

    this._emit();
  }

  _completeSegment() {
    this.onSegmentComplete();
    this.phase = Phase.GATE;
    this._emit();
  }

  // ---- User actions ------------------------------------------------------

  /** CLI 's': pause/resume the segment countdown only. */
  toggleSegmentPause() {
    this.segmentPaused = !this.segmentPaused;
    this._emit();
  }

  /** CLI 'w': pause/resume the work-hours countdown only. */
  toggleWorkdayPause() {
    this.workdayPaused = !this.workdayPaused;
    this._emit();
  }

  /** CLI 'b': pause/resume both together. */
  toggleBothPause() {
    if (this.segmentPaused && this.workdayPaused) {
      this.segmentPaused = false;
      this.workdayPaused = false;
    } else {
      this.segmentPaused = true;
      this.workdayPaused = true;
    }
    this._emit();
  }

  /** CLI 'h': hide/show the segment timer readout. */
  toggleHideSegment() {
    this.hideSegmentTimer = !this.hideSegmentTimer;
    this._emit();
  }

  /** CLI 'k': skip the current segment immediately (goes to the gate). */
  skip() {
    if (this.phase !== Phase.RUNNING || !this.segment) return;
    this.segment.remainingMs = 0;
    this._completeSegment();
  }

  /** CLI 'c': from the gate, advance to the next segment. */
  continueNext() {
    if (this.phase !== Phase.GATE || !this.segment) return;

    // Advance the visualization pointer.
    this.phaseIndex = (this.phaseIndex + 1) % this.cyclePattern.length;

    if (this.segment.type === SegType.WORK) {
      // Finished a work session. If the budget is spent, we're done.
      if (this.workHoursRemainingMs <= 0) {
        this._finish();
        return;
      }
      // Otherwise take a break -- long one every `cycles` work sessions.
      const isLong = this.cycleCount % this.cfg.cycles === 0;
      this._beginBreak(isLong);
    } else {
      // Finished a break -- back to work.
      this._beginWorkSession();
    }
  }

  _finish() {
    this.phase = Phase.DONE;
    this._stopTicker();
    this._emit();
  }

  /** Stop everything and return to the config screen. */
  reset() {
    this._stopTicker();
    this._resetRuntime();
    this.segmentPaused = false;
    this.workdayPaused = false;
    this.hideSegmentTimer = false;
    this.phase = Phase.IDLE;
    this._configured = false;
    this._emit();
  }

  // ---- Snapshot for the UI ----------------------------------------------

  _emit() {
    this.onUpdate(this.snapshot());
  }

  snapshot() {
    return {
      phase: this.phase,
      configured: this._configured,
      cfg: this.cfg,
      segment: this.segment
        ? {
            label: this.segment.label,
            type: this.segment.type,
            totalMs: this.segment.totalMs,
            remainingMs: this.segment.remainingMs,
            countsAsWork: this.segment.countsAsWork,
          }
        : null,
      segmentPaused: this.segmentPaused,
      workdayPaused: this.workdayPaused,
      hideSegmentTimer: this.hideSegmentTimer,
      workHoursRemainingMs: this.workHoursRemainingMs,
      totalWorkMs: this.totalWorkMs,
      cyclePattern: this.cyclePattern,
      phaseIndex: this.phaseIndex,
      cycleCount: this.cycleCount,
    };
  }
}

// Expose to the renderer (loaded via a plain <script> tag).
window.TimerEngine = TimerEngine;
window.PomoPhase = Phase;
window.PomoSegType = SegType;

})();
