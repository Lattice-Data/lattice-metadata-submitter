const {
  loadFunctions,
  makeFakeSheet,
  fakeResponse,
  makeFakeUrlFetchApp,
  credentialGlobals,
} = require('./support/apps-script-sandbox');

const FILES = ['Library.js', 'Endpoint.js', 'Sheet.js', 'Metadata.js', 'Profile.js', 'Connection.js'];
const ENDPOINT = 'https://api.sandbox.lattice-data.org';

const PROFILE = {
  identifyingProperties: ['uuid', 'aliases'],
  properties: {
    schema_version: { type: 'string', default: '1' },
    uuid: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    lab: { type: 'string' },
  },
};

const touched = (writes, row, col) =>
  writes.some((w) => w.row <= row && row < w.row + w.vals.length && w.col <= col && col < w.col + w.vals[0].length);

test('processSubmissionResponse records #response cells and, after a POST, the new identifiers', () => {
  const fns = loadFunctions(FILES);
  const item = { row: 2 };
  fns.processSubmissionResponse(item, fakeResponse(201, { '@graph': [{ uuid: 'u-1' }] }), PROFILE, 'POST', []);

  expect(Object.keys(item.updates)).toEqual(['#response', '#response_time', 'uuid']);
  expect(item.updates['#response']).toMatch(/^POST,201\n/);
  expect(item.updates.uuid).toBe('u-1');
});

test('processSubmissionResponse does not rewrite identifiers the row already had', () => {
  const fns = loadFunctions(FILES);
  const item = { row: 2, propsInRow: ['aliases', 'description'] };
  fns.processSubmissionResponse(
    item,
    fakeResponse(201, { '@graph': [{ uuid: 'u-1', aliases: ['lab:a'] }] }),
    PROFILE,
    'POST',
    []
  );

  expect(item.updates.uuid).toBe('u-1');
  expect(item.updates).not.toHaveProperty('aliases');
});

test('processSubmissionResponse notes the selected columns after a PATCH', () => {
  const fns = loadFunctions(FILES);
  const item = { row: 2 };
  fns.processSubmissionResponse(item, fakeResponse(200, { status: 'success' }), PROFILE, 'PATCH', [
    { col: 2, headerProp: 'aliases' },
  ]);

  expect(Object.keys(item.updates)).toEqual(['#response', '#response_time']);
  expect(item.updates['#response']).toBe('PATCH,200\nSelected props: aliases');
});

test('writeSubmissionResultsForChunk writes only the cells a response changed', () => {
  const fns = loadFunctions(FILES);
  const { sheet, writes, grid } = makeFakeSheet([
    ['uuid', 'aliases', 'description', '#response'],
    ['', '["lab:a"]', '=B2', ''], // row 2: submitted
    ['', '["lab:b"]', '=B3', 'kept'], // row 3: hidden or #skip, so not in the chunk
    ['', '["lab:c"]', '=B4', ''], // row 4: submitted
  ]);

  fns.writeSubmissionResultsForChunk(sheet, [
    { row: 2, updates: { '#response': 'POST,201', '#response_time': 't', uuid: 'u-1' } },
    { row: 4, updates: { '#response': 'POST,201', '#response_time': 't', uuid: 'u-2' } },
  ]);

  expect(grid[0]).toEqual(['uuid', 'aliases', 'description', '#response', '#response_time']);
  expect(grid[1]).toEqual(['u-1', '["lab:a"]', '=B2', 'POST,201', 't']);
  expect(grid[2]).toEqual(['', '["lab:b"]', '=B3', 'kept']);
  expect(grid[3]).toEqual(['u-2', '["lab:c"]', '=B4', 'POST,201', 't']);
  [1, 2, 3, 4, 5].forEach((col) => expect(touched(writes, 3, col)).toBe(false));
  [2, 3].forEach((col) => [2, 4].forEach((row) => expect(touched(writes, row, col)).toBe(false)));
});

test('POST then PATCH through submitSheetToPortal leave formulas, #skip and hidden rows alone', () => {
  let posted = 0;
  const { UrlFetchApp, requests } = makeFakeUrlFetchApp((req) => {
    if (req.method === 'POST') {
      posted += 1;
      const body = JSON.parse(req.payload);
      return { code: 201, body: { status: 'success', '@graph': [{ uuid: `u-${posted}`, aliases: body.aliases }] } };
    }
    return { code: 200, body: { status: 'success' } };
  });
  const documentProperties = {};
  const fns = loadFunctions(FILES, {
    UrlFetchApp,
    Logger: { log: () => {} },
    Utilities: credentialGlobals.Utilities,
    PropertiesService: {
      getUserProperties: credentialGlobals.PropertiesService.getUserProperties,
      getDocumentProperties: () => ({
        setProperty: (key, value) => {
          documentProperties[key] = value;
        },
        getProperty: (key) => documentProperties[key] || null,
        deleteProperty: (key) => {
          delete documentProperties[key];
        },
      }),
    },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({}) },
  });
  fns.getProfile = () => PROFILE;
  fns.setLastUsedSchemaVersion = () => {};
  const { sheet, grid, writes } = makeFakeSheet(
    [
      ['aliases', 'description', '#skip', 'lab'],
      ['["lab:a"]', 'd1', '', '=X1'],
      ['["lab:b"]', 'd2', '1', '=X2'], // #skip
      ['["lab:c"]', 'd3', '', '=X3'], // hidden
      ['["lab:d"]', 'd4', '', '=X4'],
    ],
    [4]
  );

  expect(fns.submitSheetToPortal(sheet, 'biosample', ENDPOINT, ENDPOINT, 'POST').numSubmitted).toBe(2);
  expect(grid[0]).toEqual(['aliases', 'description', '#skip', 'lab', '#response', '#response_time', 'uuid']);
  expect(grid[1][6]).toBe('u-1');
  expect(grid[4][6]).toBe('u-2');

  const patch = fns.submitSheetToPortal(sheet, 'biosample', ENDPOINT, ENDPOINT, 'PATCH', [
    { col: 2, headerProp: 'description' },
  ]);
  expect(patch.numSubmitted).toBe(2);
  expect(requests.filter((r) => r.method === 'PATCH').map((r) => [r.url, JSON.parse(r.payload)])).toEqual([
    [`${ENDPOINT}/biosample/u-1`, { description: 'd1' }],
    [`${ENDPOINT}/biosample/u-2`, { description: 'd4' }],
  ]);
  expect(grid[1][4]).toBe('PATCH,200\nSelected props: description');

  // Rows 3 (#skip) and 4 (hidden) and the aliases/description/#skip/lab cells were never written.
  expect(grid[2]).toEqual(['["lab:b"]', 'd2', '1', '=X2']);
  expect(grid[3]).toEqual(['["lab:c"]', 'd3', '', '=X3']);
  [3, 4].forEach((row) => [1, 2, 3, 4, 5, 6, 7].forEach((col) => expect(touched(writes, row, col)).toBe(false)));
  [2, 5].forEach((row) => [1, 2, 3, 4].forEach((col) => expect(touched(writes, row, col)).toBe(false)));
});
