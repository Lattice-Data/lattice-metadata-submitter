#!/usr/bin/env node
/**
 * Optional strict compare of merged functions bundle vs fixtures/manual/functions.gs.
 * Webpack file concat order may differ from the Apps Script editor; enable only when chasing byte parity.
 *
 * Usage: FULL_PARITY=1 npm run test:parity
 */

const fs = require('fs');
const path = require('path');

function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

function main() {
  if (!process.env.FULL_PARITY) {
    console.log('compare-bundle-parity: skipped (set FULL_PARITY=1 to run)');
    process.exit(0);
  }

  const root = path.join(__dirname, '..');
  const manualPath = path.join(root, 'fixtures', 'manual', 'functions.gs');
  const distPath = path.join(root, 'dist', 'functions.js');

  if (!fs.existsSync(manualPath)) {
    console.error('Missing', manualPath);
    process.exit(1);
  }
  if (!fs.existsSync(distPath)) {
    console.error('Missing dist/functions.js — run npm run build first');
    process.exit(1);
  }

  const a = normalize(fs.readFileSync(manualPath, 'utf8'));
  const b = normalize(fs.readFileSync(distPath, 'utf8'));

  if (a !== b) {
    console.error('FULL_PARITY: fixtures/manual/functions.gs !== dist/functions.js after normalize()');
    process.exit(1);
  }
  console.log('FULL_PARITY: OK');
}

main();
