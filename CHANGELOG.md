# Changelog

All notable changes to **Pomo Electron** are recorded here.

This project follows [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH` — bump **MAJOR** for breaking changes, **MINOR** for new
features, **PATCH** for fixes.

Entries are intentionally kept high-level and user-facing (no internal or
security-sensitive detail). Newest version on top.

## [1.4.0] — 2026-07-06

### Added
- Focus stats: the app now tracks how much focused work time you complete each
  week. Open **Stats** in the footer to see this week's total, your recent
  weeks, and your all-time total. Your history is saved on your computer and
  carries over across updates.

## [1.3.0] — 2026-07-06

### Changed
- Changelog and release-notes tidy-up.

## [1.2.1] — 2026-07-06

### Added
- Automated release pipeline — publishing a new version now builds and releases
  the app automatically.

## [1.1.0] — 2026-07-06

### Added
- Compact, fixed-size window so the timer always fits neatly on screen.
- In-app "What's new" history view, reachable from the footer.

### Changed
- Refreshed the underlying app runtime for better performance and up-to-date
  security.

### Fixed
- Resolved a display issue that could cause the screens to render incorrectly.

## [1.0.0] — 2026-07-06

### Added
- Initial release. A Pomodoro timer with:
  - a total **work-hours** budget (breaks never count against it),
  - short and long breaks with configurable cycles,
  - an optional **preset** mode that spreads even breaks across your day,
  - independent pause controls for the segment timer and the work-hours count,
  - a skip control, a hideable segment timer, and keyboard shortcuts.
