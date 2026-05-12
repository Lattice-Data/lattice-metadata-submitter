const fs = require('fs');
const path = require('path');

function readAllFunctionsSources() {
  const dir = path.join(__dirname, '..', 'functions');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

test('no ZOPA debug string in functions sources', () => {
  expect(readAllFunctionsSources()).not.toContain('ZOPA');
});

test('no ZOPA in built functions bundle when dist exists', () => {
  const distPath = path.join(__dirname, '..', 'dist', 'functions.js');
  if (!fs.existsSync(distPath)) {
    return;
  }
  expect(fs.readFileSync(distPath, 'utf8')).not.toContain('ZOPA');
});
