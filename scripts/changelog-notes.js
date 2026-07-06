'use strict';
// -------------------------------------------------------------------------
// Prints the release notes for one version, taken from CHANGELOG.md, plus a
// standard download/first-run footer. Used by the release GitHub Action.
//
//   node scripts/changelog-notes.js [version]
//
// Defaults to the current package.json version. Output goes to stdout so the
// workflow can redirect it into a --notes-file.
// -------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = process.argv[2] || require(path.join(root, 'package.json')).version;
const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const lines = md.split(/\r?\n/);

const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
let body = '';
if (start !== -1) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) { end = i; break; }
  }
  body = lines.slice(start + 1, end).join('\n').trim();
}
if (!body) body = `Release ${version}.`;

const footer =
  '\n\n---\n\n' +
  '**Download:** grab the `.exe` from the Assets below (Windows 10/11, 64-bit). ' +
  "It's portable — just double-click, no installation needed.\n\n" +
  '> **First launch:** Windows may show *"Windows protected your PC"* because the ' +
  'app isn\'t code-signed. Click **More info → Run anyway**.';

process.stdout.write(body + footer + '\n');
