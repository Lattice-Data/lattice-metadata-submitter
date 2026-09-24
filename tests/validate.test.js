const fs = require('fs');
const path = require('path');
const vm = require('vm');

const functionsDir = path.join(__dirname, '..', 'functions');
// Profile.js reads Metadata.js consts at top level, so Metadata.js loads first.
const FILES = ['Library.js', 'Sheet.js', 'Metadata.js', 'Profile.js'];
const ENDPOINT = 'https://api.sandbox.lattice-data.org';

const PROFILE = {
  identifyingProperties: ['uuid', 'aliases'],
  properties: {
    uuid: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
  },
};

// Loads functions/*.js files into one context, the way Apps Script shares a single
// global scope between files.
function loadFunctions() {
  const sandbox = { JSON, Object, Array, Logger: { log: () => {} } };
  vm.createContext(sandbox);
  FILES.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(functionsDir, file), 'utf8'), sandbox, { filename: file });
  });
  return sandbox;
}

// A minimal Sheet over a copy of `rows` (rows[0] is the header, row 1). Returns the
// live grid and a record of every setValues.
function makeFakeSheet(rows, hiddenRows = []) {
  const grid = rows.map((r) => r.slice());
  const writes = [];
  const cell = (r, c) => {
    const row = grid[r - 1] || [];
    return row[c - 1] === undefined ? '' : row[c - 1];
  };
  const sheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(0, ...grid.map((r) => r.length)),
    isRowHiddenByUser: (row) => hiddenRows.includes(row),
    getRange: (row, col, numRows = 1, numCols = 1) => {
      const read = () =>
        Array.from({ length: numRows }, (_, i) => Array.from({ length: numCols }, (__, j) => cell(row + i, col + j)));
      return {
        getValues: read,
        getDisplayValues: () => read().map((r) => r.map(String)),
        setValues: (vals) => {
          writes.push({ row, col, vals });
          vals.forEach((r, i) =>
            r.forEach((v, j) => {
              grid[row + i - 1] = grid[row + i - 1] || [];
              grid[row + i - 1][col + j - 1] = v;
            })
          );
        },
      };
    },
  };
  return { sheet, writes, grid };
}

function setUp(rows, hiddenRows) {
  const fns = loadFunctions();
  const validated = [];
  fns.getProfile = () => PROFILE;
  // Stands in for the Ajv validator bundled into code.gs: description is required.
  fns.validateJson = (schema, data) => {
    validated.push(data);
    return data.description
      ? { valid: true, errors: null }
      : { valid: false, errors: [{ instancePath: '', message: "must have required property 'description'" }] };
  };
  return { fns, validated, ...makeFakeSheet(rows, hiddenRows) };
}

const touched = (writes, row, col) =>
  writes.some((w) => w.row <= row && row < w.row + w.vals.length && w.col <= col && col < w.col + w.vals[0].length);

test('Validate writes only #response and #response_time, keeping # columns and formulas', () => {
  const { fns, validated, sheet, grid, writes } = setUp(
    [
      ['aliases', 'description', '#upload_abspath', '#notes', '#skip', '#response'],
      ['["lab:a"]', 'ok', '/data/a.fastq.gz', 'keep me', '0', 'old'], // row 2: valid
      ['["lab:b"]', '', '/data/b.fastq.gz', 'keep me too', '', ''], // row 3: invalid
      ['["lab:c"]', 'c', '/data/c.fastq.gz', '', '1', 'untouched'], // row 4: #skip
      ['["lab:d"]', 'd', '/data/d.fastq.gz', '', '', 'untouched'], // row 5: hidden
      ['[see notes]', 'e', '', '', '', ''], // row 6: looks like JSON but isn't
      ['["lab:f"]', '=B2', '', '', '', ''], // row 7: formula
    ],
    [5]
  );

  expect(fns.validateSheet(sheet, 'biosample', ENDPOINT)).toBe(4);

  expect(grid[0]).toEqual([
    'aliases',
    'description',
    '#upload_abspath',
    '#notes',
    '#skip',
    '#response',
    '#response_time',
  ]);
  expect(grid[1].slice(0, 6)).toEqual(['["lab:a"]', 'ok', '/data/a.fastq.gz', 'keep me', '0', 'ValidationSuccess']);
  expect(grid[2].slice(0, 5)).toEqual(['["lab:b"]', '', '/data/b.fastq.gz', 'keep me too', '']);
  expect(JSON.parse(grid[2][5])[0].message).toBe("must have required property 'description'");
  expect(grid[3]).toEqual(['["lab:c"]', 'c', '/data/c.fastq.gz', '', '1', 'untouched']);
  expect(grid[4]).toEqual(['["lab:d"]', 'd', '/data/d.fastq.gz', '', '', 'untouched']);
  expect(grid[5][5]).toMatch(/^Could not validate this row: SyntaxError/);
  expect(grid[6].slice(0, 6)).toEqual(['["lab:f"]', '=B2', '', '', '', 'ValidationSuccess']);
  expect(grid[6][6]).not.toBe('');

  // Commented props aren't validated, and nothing outside the two #response columns
  // is written; #skip and hidden rows aren't written at all.
  expect(validated.every((data) => Object.keys(data).every((prop) => !prop.startsWith('#')))).toBe(true);
  [2, 3, 4, 5, 6, 7].forEach((row) => [1, 2, 3, 4, 5].forEach((col) => expect(touched(writes, row, col)).toBe(false)));
  [4, 5].forEach((row) => [6, 7].forEach((col) => expect(touched(writes, row, col)).toBe(false)));
});

test('Validate adds #response and #response_time at the end when the sheet has neither', () => {
  const { fns, sheet, grid } = setUp([
    ['aliases', 'description', '#notes'],
    ['["lab:a"]', 'ok', 'n'],
  ]);

  expect(fns.validateSheet(sheet, 'biosample', ENDPOINT)).toBe(1);
  expect(grid[0]).toEqual(['aliases', 'description', '#notes', '#response', '#response_time']);
  expect(grid[1].slice(0, 4)).toEqual(['["lab:a"]', 'ok', 'n', 'ValidationSuccess']);
});
