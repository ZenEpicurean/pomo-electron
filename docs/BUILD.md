# Building & Changing Pomo Electron

This guide assumes you've **never used Electron before**. It explains what the
moving parts are, how to run the app while you develop, and how to produce a
file you can send to other people.

---

## 1. What is Electron, in one paragraph?

Electron lets you build a desktop app using the same technologies as a web page
— **HTML, CSS, and JavaScript** — wrapped in a real application window. Under
the hood it bundles **Chromium** (the engine behind Chrome) to render your UI
and **Node.js** to do system-level things. So this app is really "a tiny web
page in a window," which is why the UI files live in `src/renderer/` and look
like a website.

An Electron app has two kinds of processes:

| Process        | Runs where            | Job                                                  | Our files                        |
| -------------- | --------------------- | --------------------------------------------------- | -------------------------------- |
| **Main**       | Node.js               | Create windows, talk to the OS. One per app.        | `src/main/main.js`               |
| **Renderer**   | Chromium (a web page) | Draw the UI, handle clicks. One per window.         | everything in `src/renderer/`    |
| **Preload**    | A secure bridge       | Safely expose specific Node features to the page.   | `src/main/preload.js`            |

The timer logic runs entirely in the **renderer**. The main process just opens
the window.

---

## 2. One-time setup

1. Install **Node.js (LTS)** from <https://nodejs.org/>. This also installs
   `npm`. Verify in PowerShell:

   ```powershell
   node --version
   npm --version
   ```

2. From the project folder, install dependencies (downloads Electron itself):

   ```powershell
   npm install
   ```

   This creates a `node_modules/` folder. It's large and should never be
   committed to git (it's already in `.gitignore`).

---

## 3. Run the app while developing

```powershell
npm start
```

This launches the app using your local Electron. Leave it running while you
edit files.

- **Changed HTML/CSS/JS in `src/renderer/`?** Just reload the window:
  **`Ctrl+R`** (or close and `npm start` again).
- **Changed `src/main/main.js` or `preload.js`?** You must fully **stop and
  restart** `npm start` (main-process code loads only at launch).

### Debugging (DevTools)

The renderer is a web page, so you get Chrome DevTools. Open them with
**`Ctrl+Shift+I`**, or auto-open on launch by uncommenting this line in
`src/main/main.js`:

```js
// mainWindow.webContents.openDevTools({ mode: 'detach' });
```

Use the **Console** tab to see errors and `console.log()` output from the
renderer.

---

## 4. Build a shareable app

The packaging tool is [`electron-builder`](https://www.electron.build/),
already configured in `package.json` under the `"build"` key.

```powershell
npm run dist
```

This produces, in the **`release/`** folder:

- **`Pomo Electron Setup 1.0.0.exe`** — a normal Windows installer (Start-menu
  entry, desktop shortcut, uninstaller).
- **`PomoElectron-1.0.0-portable.exe`** — a single self-contained file. No
  installation: the recipient double-clicks it and the app runs.

Other useful commands:

```powershell
npm run dist:portable    # only the portable .exe
npm run dist:installer   # only the installer
npm run pack             # unpacked app folder (fast; for testing packaging)
```

> **First build is slow.** electron-builder downloads a cached copy of Electron
> and packaging helpers. Later builds are much faster.

> **⚠️ Windows: turn on Developer Mode before your first `npm run dist`.**
> Building the installer/portable targets makes electron-builder unpack its
> `winCodeSign` helper, which contains symbolic links. Windows blocks creating
> symlinks unless you either **enable Developer Mode** or run the terminal **as
> Administrator**. Without it you'll see:
>
> ```
> ERROR: Cannot create symbolic link : A required privilege is not held by the client.
> ```
>
> **Fix (do this once):** Settings → **Privacy & security → For developers →
> Developer Mode → On**. Then re-run `npm run dist`. (`npm run pack`, the
> unpacked build, does *not* need this — it finishes before that step.)
>
> **Prefer not to leave Developer Mode on?** You don't have to. Two options:
> - Turn it **On** only while building, then switch it **Off** afterward
>   (same Settings page). Your already-built `.exe` keeps working; you'd just
>   flip it back On before a future rebuild.
> - Or leave Developer Mode **Off** permanently and instead launch your
>   terminal **as Administrator** to build — admins can create symlinks too.
>
> Developer Mode does **not** disable Defender, Firewall, UAC, or SmartScreen;
> it mainly allows app sideloading and non-admin symlink creation. Turning it
> off when you're done building is a reasonable "minimal surface" habit.

> **⚠️ PowerShell: "running scripts is disabled on this system".** If `npm`
> fails with a `PSSecurityException` about `npm.ps1`, PowerShell's execution
> policy is blocking script wrappers. Fix it once (non-admin):
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
>
> Or, for a one-off without changing anything, call the `.cmd` wrapper:
> `npm.cmd run dist:portable`.

### Sending it to people

The **portable `.exe`** is the easiest thing to share (email, USB, download
link). It needs no Node.js and no install. Windows SmartScreen may warn that
the app is from an "unknown publisher" because it isn't code-signed — the
recipient clicks **More info → Run anyway**. Code signing (to remove that
warning) requires a paid certificate and is out of scope here; see
[electron-builder code signing docs](https://www.electron.build/code-signing)
if you ever want it.

### Building for macOS / Linux

`npm run dist` on **Windows** produces Windows builds. To build for macOS you
generally need to run the build **on a Mac**; for Linux, on Linux (or WSL).
The `"build"` config already targets Windows; add `mac`/`linux` sections to
`package.json` if needed — see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 5. Releasing a new version (version + changelog)

**The quick way — one command bumps the version *and* scaffolds the changelog:**

```powershell
npm run release:patch   # 1.1.0 -> 1.1.1   (bug fixes)
npm run release:minor   # 1.1.0 -> 1.2.0   (new features)
npm run release:major   # 1.1.0 -> 2.0.0   (breaking changes)
```

That updates `"version"` in `package.json` and inserts a new, dated section at
the top of [`../CHANGELOG.md`](../CHANGELOG.md) for you. It does **not** build
and does **not** touch git, so you can review first. Then:

1. **Edit `CHANGELOG.md`** — replace the placeholder bullet with what actually
   changed. Add/remove `### Added` / `### Changed` / `### Fixed` sections as
   needed. Keep entries **high-level and user-facing**: no internal details,
   file names, exact dependency/version numbers, or anything security-sensitive
   — users read this text in the app's "What's new" window.

2. **Rebuild** (`npm run dist:portable`, etc.). The new version number and
   changelog are picked up automatically — the app reads `CHANGELOG.md` at
   runtime, so there's nothing else to wire up.

**All-in-one (bump + edit + build):** the `:build` variants do the whole thing:

```powershell
npm run release:patch:build
npm run release:minor:build
npm run release:major:build
```

These bump the version, scaffold the changelog, **open `CHANGELOG.md` and pause**
for you to edit + save it, then build the portable exe the moment you press
Enter. (Because the changelog ships inside the app, this deliberately waits for
your edits first — in a non-interactive shell it stops instead of building, so
a placeholder is never shipped. Want a different target? `node scripts/release.js
minor --build=dist`.)

> The footer's **v1.x.x** is your quick check that a freshly built exe is the
> one running; clicking **"What's new"** shows the changelog.

**The manual way** (if you'd rather not use the script): edit `"version"` in
`package.json` yourself, then add a matching `## [x.y.z] — YYYY-MM-DD` section
at the top of `CHANGELOG.md` in the same shape as the existing entries, and
rebuild. Follow [SemVer](https://semver.org/): `MAJOR.MINOR.PATCH`.

---

## 6. The app icon

The app ships with a themed tomato icon in `build/`:

- `build/icon.ico` — multi-size (16–256px) Windows icon; the exe uses this.
- `build/icon.png` — 256px version; the window/taskbar icon at runtime.

These are **generated** by `build/gen-icon.js` (pure Node, no image tools).
To tweak the look, edit the color/geometry constants in that file and re-run:

```powershell
node build/gen-icon.js
```

Prefer your own artwork instead? Just replace `build/icon.ico` (≥256×256) and
`build/icon.png` (256×256) with your files and rebuild — the generator is
optional. electron-builder picks up `build/icon.ico` automatically (it's also
set explicitly under `build.win.icon` in `package.json`).

---

## 7. Common problems

| Symptom                                   | Fix                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `npm start` says "electron not found"     | Run `npm install` first.                                            |
| Blank white window                        | Open DevTools (`Ctrl+Shift+I`), check the Console for a JS error.   |
| Edits to the UI don't show                | Reload with `Ctrl+R`. For main-process edits, restart `npm start`.  |
| Build fails downloading Electron          | Check your internet/proxy; delete `node_modules` and reinstall.     |
| `Cannot create symbolic link` during dist | Enable **Developer Mode** (see the warning in §4) or run as Admin.   |
| Antivirus flags the portable exe          | Expected for unsigned Electron apps; whitelist or code-sign it.     |

---

Next: **[ARCHITECTURE.md](ARCHITECTURE.md)** explains what each file does and
where to make specific kinds of changes.
