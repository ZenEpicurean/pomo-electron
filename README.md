# Pomo Electron

A desktop Pomodoro timer built with [Electron](https://www.electronjs.org/).
It's a GUI version of the original `pomodoro.js` CLI, with the same core idea:

- You set a **total number of work hours** to complete for the day.
- Work happens in **focused sessions** separated by **short breaks**, with a
  **long break** every few sessions.
- **Breaks never count against your work-hours budget.**
- You can pause the **segment timer** and the **work-hours countdown**
  independently, skip a segment, or hide the segment timer.

---

## Quick start (run from source)

You need [Node.js](https://nodejs.org/) installed (which comes with `npm`).

```powershell
# from the project folder:
npm install      # one-time: downloads Electron and build tools
npm start        # launches the app
```

## Build something you can share

```powershell
npm run dist          # builds BOTH an installer and a portable .exe
npm run dist:portable # just the single-file portable .exe
npm run dist:installer# just the Windows installer
```

The finished files land in the **`release/`** folder. Hand someone the
portable `.exe` and they can double-click it — no install, no Node required.

For a full walkthrough (and how to change things), see
**[docs/BUILD.md](docs/BUILD.md)** and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Using the app

1. On the config screen, set your session length, break lengths, how many
   sessions between long breaks, and your total work hours. Click **Start**.
2. **Preset mode (optional):** enter a "Preset total hours" value to fit all
   work **and** breaks into exactly that many hours. It auto-computes uniform
   break lengths and overrides the break/long/cycles fields — same behavior as
   the CLI's `--preset` flag.
3. When a segment ends you'll hear a chime and see a **Continue** button (a
   deliberate gate so a break can't start without you noticing).

### Controls & shortcuts

| Key            | Action                                            |
| -------------- | ------------------------------------------------- |
| `S`            | Pause/resume the **segment** timer only           |
| `W`            | Pause/resume the **work-hours** countdown only    |
| `B`            | Pause/resume **both**                             |
| `K`            | **Skip** the current segment                      |
| `H`            | **Hide/show** the segment timer                   |
| `C` or `Space` | **Continue** to the next segment (at the gate)    |

The work-hours countdown only ticks down during **work** sessions.

---

## License

MIT
