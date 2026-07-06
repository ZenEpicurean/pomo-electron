'use strict';
// -------------------------------------------------------------------------
// Release helper.
//
//   npm run release:patch | release:minor | release:major
//       -> bump version + scaffold a CHANGELOG.md entry, then stop so you can
//          edit the changelog and build when ready.
//
//   npm run release:patch:build | release:minor:build | release:major:build
//       -> same, then PAUSE for you to fill in the changelog, then build the
//          portable exe automatically.
//
// (Advanced: `node scripts/release.js minor --build=dist` picks a different
//  build target. Valid targets: dist, dist:portable, dist:installer, pack.)
//
// It never touches git.
// -------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

const VALID_TARGETS = ['dist', 'dist:portable', 'dist:installer', 'pack'];

// --- parse args ---
const args = process.argv.slice(2);
const type = (args.find((a) => !a.startsWith('-')) || 'patch').toLowerCase();
const buildArg = args.find((a) => a === '--build' || a.startsWith('--build='));
const doBuild = !!buildArg;
const buildTarget =
  buildArg && buildArg.includes('=') ? buildArg.split('=')[1] : 'dist:portable';

if (!['patch', 'minor', 'major'].includes(type)) {
  console.error(`Unknown release type "${type}". Use: patch | minor | major`);
  process.exit(1);
}
if (doBuild && !VALID_TARGETS.includes(buildTarget)) {
  console.error(`Unknown build target "${buildTarget}". Use one of: ${VALID_TARGETS.join(', ')}`);
  process.exit(1);
}

// --- 1) bump package.json (targeted replace keeps the file's formatting) ---
const pkgText = fs.readFileSync(pkgPath, 'utf8');
const m = pkgText.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error('Could not find a "version": "X.Y.Z" field in package.json.');
  process.exit(1);
}
let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
const old = `${maj}.${min}.${pat}`;
if (type === 'major') { maj += 1; min = 0; pat = 0; }
else if (type === 'minor') { min += 1; pat = 0; }
else { pat += 1; }
const next = `${maj}.${min}.${pat}`;

fs.writeFileSync(pkgPath, pkgText.replace(m[0], `"version": "${next}"`));

// --- 2) prepend a CHANGELOG.md stub above the newest existing entry ---
const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const stub =
  `## [${next}] — ${date}\n\n` +
  `### Changed\n` +
  `- Describe the user-facing changes here (keep it high-level, no sensitive detail).\n\n`;

let cl = fs.readFileSync(changelogPath, 'utf8');
const idx = cl.indexOf('\n## [');
if (idx === -1) {
  cl = cl.trimEnd() + '\n\n' + stub;
} else {
  cl = cl.slice(0, idx + 1) + stub + cl.slice(idx + 1);
}
fs.writeFileSync(changelogPath, cl);

console.log(`\nVersion bumped: ${old} -> ${next}`);
console.log(`CHANGELOG.md: added a "${next}" section dated ${date}.\n`);

// --- 3) build (only for the *:build variants) ---
function runBuild() {
  console.log(`\nBuilding: npm run ${buildTarget}\n`);
  execSync(`npm run ${buildTarget}`, { cwd: root, stdio: 'inherit' });
  console.log(`\nDone — built ${next}. See the release/ folder for the output.\n`);
}

if (!doBuild) {
  console.log('Next steps:');
  console.log('  1. Edit CHANGELOG.md — fill in what changed (high-level only).');
  console.log('  2. npm run dist:portable   (or dist / dist:installer)\n');
  process.exit(0);
}

// Chained build path: the changelog still has a placeholder, and it gets
// bundled into the app, so pause for the user to edit it before building.
if (!process.stdin.isTTY) {
  // Non-interactive shell (e.g. CI): can't pause. Refuse to build so we never
  // ship the placeholder changelog unattended.
  console.warn('Non-interactive shell detected — NOT building automatically.');
  console.warn('Edit CHANGELOG.md, then run:  npm run ' + buildTarget + '\n');
  process.exit(0);
}

// Best-effort: open the changelog in the default editor so it's easy to edit.
openInEditor(changelogPath);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(
  `Edit and SAVE CHANGELOG.md, then press Enter to build ${next} (Ctrl+C to cancel)... `,
  () => {
    rl.close();
    runBuild();
  }
);

function openInEditor(file) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    /* opening is a convenience; ignore failures */
  }
}
