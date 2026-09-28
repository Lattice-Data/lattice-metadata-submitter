const fs = require('fs');
const path = require('path');
const vm = require('vm');

const functionsDir = path.join(__dirname, '..', '..', 'functions');

// Loads functions/*.js files into one context, the way Apps Script shares a single
// global scope between files. Order matters for top-level consts, as in the bundle.
function loadFunctions(files, globals = {}) {
  const sandbox = { JSON, Object, Array, Set, Map, ...globals };
  vm.createContext(sandbox);
  files.forEach((file) => {
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
        getValue: () => cell(row, col),
        getValues: read,
        getDisplayValues: () => read().map((r) => r.map(String)),
        setValues: (vals) => {
          // Sheets refuses the whole write when any cell would exceed its limit.
          vals.forEach((r) =>
            r.forEach((v) => {
              if (typeof v === 'string' && v.length > 50000) {
                throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
              }
            })
          );
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

function fakeResponse(code, body, headers = {}) {
  return {
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getHeaders: () => headers,
  };
}

// UrlFetchApp whose fetch and fetchAll answer each request with
// handler(request) -> {code, body, headers}; every request is recorded.
function makeFakeUrlFetchApp(handler) {
  const requests = [];
  const answer = (req) => {
    requests.push(req);
    const res = handler(req);
    return fakeResponse(res.code, res.body, res.headers);
  };
  const UrlFetchApp = {
    fetch: (url, params = {}) => answer({ url, ...params }),
    fetchAll: (params) => params.map(answer),
  };
  return { UrlFetchApp, requests };
}

// Stored Lattice access key/secret, so requests carry Basic auth as in the real sheet.
const credentialGlobals = {
  PropertiesService: {
    getUserProperties: () => ({
      getProperty: (key) => ({ latticeUsername: 'KEY', latticePassword: 'SECRET' }[key] || null),
    }),
  },
  Utilities: { base64Encode: (s) => Buffer.from(s).toString('base64'), sleep: () => {} },
};

module.exports = { loadFunctions, makeFakeSheet, fakeResponse, makeFakeUrlFetchApp, credentialGlobals };
