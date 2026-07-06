# Architecture & "where do I change X?"

A map of the project so you can find the right file quickly.

```
Pomo-Electron/
├─ package.json          App metadata, scripts, and the electron-builder config
├─ src/
│  ├─ main/
│  │  ├─ main.js         MAIN process: creates the window. Small.
│  │  └─ preload.js      Secure bridge exposing window.pomo.* to the page
│  └─ renderer/          The UI (a little web app)
│     ├─ index.html      Page structure: config / timer / done screens
│     ├─ styles.css      All styling + theme variables (top of file)
│     ├─ engine.js       TimerEngine: ALL the Pomodoro logic (no DOM)
│     ├─ stats.js        PomoStats: focus stats saved in localStorage
│     └─ app.js          Glue: reads the form, renders state, handles keys
├─ build/
│  ├─ icon.ico / icon.png  App icon (exe + window)
│  └─ gen-icon.js          Regenerates the icons (node build/gen-icon.js)
├─ CHANGELOG.md          Version history (shown in the app's "What's new")
├─ scripts/
│  ├─ release.js         Bumps version + scaffolds a CHANGELOG entry
│  └─ changelog-notes.js Extracts one version's notes for the release workflow
├─ docs/                 These docs
└─ release/              Build output (generated; git-ignored)
```

## The two halves

**`engine.js` (the brain)** is a plain JavaScript class with *no* knowledge of
HTML. It holds the countdown state, ticks once per second, and calls an
`onUpdate(snapshot)` callback. This is a direct port of the CLI's logic and is
where the "rules" live.

**`app.js` (the hands)** owns the DOM. It reads the config form, calls engine
methods when you click buttons or press keys, and paints each `snapshot` into
the page. It never contains timer *rules* — just presentation.

This split means you can change how it *looks* (app.js/styles.css) without
touching how it *works* (engine.js), and vice-versa.

## The engine's state machine

`engine.phase` is always one of:

- `IDLE` — config screen; not started.
- `RUNNING` — a segment is counting down.
- `GATE` — a segment just finished; waiting for **Continue** (the CLI's
  "press c"). This is why breaks never start silently.
- `DONE` — all work hours complete.

Each 1-second tick (`_tick`) does exactly what the CLI's `countdown()` loop
did: decrement the segment unless `segmentPaused`, decrement work-hours only
during work segments unless `workdayPaused`, and fire the gate when the
segment hits zero.

## "Where do I change…?"

| I want to…                                            | Edit…                                                    |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Change default work/break lengths in the form         | `src/renderer/index.html` (the `value="…"` on inputs)    |
| Change colors / fonts / spacing                        | `src/renderer/styles.css` (`:root` variables at the top) |
| Change the beep/chime sound                            | `beep()` in `src/renderer/app.js`                        |
| Change timer rules (how breaks/preset are computed)    | `src/renderer/engine.js` (`resolveConfig`, the engine)   |
| Add/adjust a keyboard shortcut                         | the `keydown` handler in `src/renderer/app.js`           |
| Change the window size or title                        | `createWindow()` in `src/main/main.js`                   |
| Change the app icon                                    | edit + run `build/gen-icon.js`, or replace `build/icon.*` |
| Show the OS menu bar                                   | remove `Menu.setApplicationMenu(null)` in `main.js`      |
| Expose a Node feature (files, notifications) to the UI | add to `preload.js` + a handler in `main.js` (see below) |
| Change app name / version / build targets              | `package.json`                                           |
| Add a release note / version history entry             | `CHANGELOG.md` (see BUILD.md §5)                          |
| Change what focus stats are tracked / stored           | `src/renderer/stats.js` (localStorage, userData-backed)  |

## Adding a native feature (IPC pattern)

Because the renderer has no direct Node access (a security best practice), any
OS-level capability is exposed explicitly. The existing "get app version" is a
template:

1. **main.js** — handle a named channel:
   ```js
   ipcMain.handle('app:getVersion', () => app.getVersion());
   ```
2. **preload.js** — expose a safe function:
   ```js
   contextBridge.exposeInMainWorld('pomo', {
     getVersion: () => ipcRenderer.invoke('app:getVersion'),
   });
   ```
3. **app.js** — call it:
   ```js
   const v = await window.pomo.getVersion();
   ```

To, say, add **native desktop notifications** when a break starts, add a
`notify(title, body)` method following the same three steps, using Electron's
`Notification` in the main process.

## Building for other platforms

`package.json` → `"build"` currently targets Windows (`nsis` + `portable`). To
also target macOS/Linux, add sibling keys (and build on that OS):

```json
"mac":   { "target": ["dmg"] },
"linux": { "target": ["AppImage"] }
```

See the [electron-builder docs](https://www.electron.build/configuration/configuration)
for all options.

## Why no bundler (webpack/vite)?

The renderer uses plain `<script>` tags (`engine.js` then `app.js`) and no
`npm` packages, so there's nothing to bundle. This keeps the project simple to
understand and modify. If you later add front-end libraries, consider adding a
bundler — but you don't need one today.
