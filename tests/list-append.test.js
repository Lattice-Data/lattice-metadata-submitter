const {
  loadFunctions,
  makeFakeSheet,
  makeFakeUrlFetchApp,
  credentialGlobals,
} = require('./support/apps-script-sandbox');

// Load order follows the bundle's needs: Profile.js reads Metadata.js consts at top level.
const FILES = ['Library.js', 'Endpoint.js', 'Sheet.js', 'Metadata.js', 'Profile.js', 'Connection.js', 'ListAppend.js', 'ListColumns.js'];
const ENDPOINT = 'https://api.sandbox.lattice-data.org';

// Like the Lattice schemas: objects are found by uuid or by their first alias.
const PROFILE = {
  identifyingProperties: ['uuid', 'aliases'],
  properties: {
    uuid: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    documents: { type: 'array', items: { type: 'string', linkTo: 'Document' } },
    description: { type: 'string' },
  },
};

// A fake portal holding biosamples by uuid or alias. Each object has a tid that
// every PATCH bumps, and PATCH only succeeds with If-Match carrying the current
// tid, like snovault's if_match_tid. afterFirstRead simulates a colleague's edit
// landing between our read and our write; hooks.beforePatch lets a test change
// the sheet while requests are in flight.
function makePortal(objects, options = {}) {
  const {
    lookups = {},
    lookupFailures = {},
    afterFirstRead = {},
    dropEtag = false,
    weakEtag = false,
    alwaysConflict = false,
  } = options;
  const hooks = { beforePatch: null };
  const tids = {};
  const reads = {};
  const lookupCalls = {};
  Object.keys(objects).forEach((id) => {
    tids[id] = 1;
  });
  const handler = (req) => {
    const url = req.url.replace(ENDPOINT, '');
    let m = url.match(/^\/biosample\/([^/]+)\/@@edit\?format=json$/);
    if (req.method === 'GET' && m) {
      const id = decodeURIComponent(m[1]);
      if (!objects[id]) {
        return { code: 404, body: { status: 'error', title: 'Not Found' } };
      }
      const etag = `"${id}=${tids[id]}"`;
      const res = {
        code: 200,
        body: JSON.parse(JSON.stringify(objects[id])),
        headers: dropEtag ? {} : { ETag: weakEtag ? `W/${etag}` : etag },
      };
      reads[id] = (reads[id] || 0) + 1;
      if (reads[id] === 1 && afterFirstRead[id]) {
        afterFirstRead[id](objects[id]);
        tids[id] += 1;
      }
      return res;
    }
    m = url.match(/^\/biosample\/([^/?]+)$/);
    if (req.method === 'PATCH' && m) {
      const id = decodeURIComponent(m[1]);
      if (hooks.beforePatch) {
        hooks.beforePatch(id);
      }
      if (alwaysConflict || req.headers['If-Match'] !== `"${id}=${tids[id]}"`) {
        return { code: 412, body: { status: 'error', description: 'The resource has changed.' } };
      }
      Object.assign(objects[id], JSON.parse(req.payload));
      tids[id] += 1;
      return { code: 200, body: { status: 'success' } };
    }
    m = url.match(/^(\/.*\/)\?format=json&frame=object$/);
    if (req.method === 'GET' && m) {
      const path = m[1];
      lookupCalls[path] = (lookupCalls[path] || 0) + 1;
      if (lookupCalls[path] <= (lookupFailures[path] || 0)) {
        return { code: 503, body: { status: 'error', title: 'Service Unavailable' } };
      }
      if (lookups[path]) {
        return { code: 200, body: { '@id': lookups[path] } };
      }
    }
    return { code: 404, body: { status: 'error', title: 'Not Found' } };
  };
  return { handler, objects, hooks, lookupCalls };
}

// listProps are the selected list columns; in the sheet they always exist in the header.
function setUp(grid, portal, { hiddenRows = [], listProps = ['aliases', 'documents'] } = {}) {
  const { UrlFetchApp, requests } = makeFakeUrlFetchApp(portal.handler);
  const fns = loadFunctions(FILES, { UrlFetchApp, ...credentialGlobals });
  fns.getProfile = () => PROFILE;
  const fake = makeFakeSheet(grid, hiddenRows);
  const run = () => fns.appendToListsInSheet(fake.sheet, 'biosample', ENDPOINT, listProps);
  return { fns, run, requests, ...fake };
}

const patches = (requests) => requests.filter((r) => r.method === 'PATCH');
const edits = (requests) => requests.filter((r) => r.url.includes('@@edit'));
const touchesRow = (writes, row) => writes.some((w) => w.row <= row && row <= w.row + w.vals.length - 1);
const touchesCol = (writes, col) => writes.some((w) => w.col <= col && col <= w.col + w.vals[0].length - 1);
const outcome = (counts) => ({
  total: 0,
  done: 0,
  changed: 0,
  unchanged: 0,
  failed: 0,
  moved: 0,
  stoppedEarly: false,
  ...counts,
});
// The header plus one row per object bs-1..bs-n, built by cellsFor(uuid). 31 rows
// make two batches (SUBMIT_FETCH_CHUNK_SIZE is 30).
function manyRows(n, header, cellsFor) {
  return [header].concat(Array.from({ length: n }, (_, i) => cellsFor(`bs-${i + 1}`)));
}

describe('list merge helpers', () => {
  const fns = loadFunctions(FILES);

  test('mergeListItems keeps the portal order and appends only new items', () => {
    expect(fns.mergeListItems(['a', 'b'], ['c', 'a', 'c'])).toEqual({
      merged: ['a', 'b', 'c'],
      added: ['c'],
      alreadyPresent: ['a', 'c'],
    });
  });

  test('mergeListItems treats objects with the same keys in any order as equal', () => {
    const result = fns.mergeListItems([{ x: 1, y: 2 }], [{ y: 2, x: 1 }]);
    expect(result.added).toEqual([]);
    expect(result.merged).toEqual([{ x: 1, y: 2 }]);
  });

  test('parseListCell accepts only JSON lists', () => {
    expect(fns.parseListCell('')).toEqual({ items: [] });
    expect(fns.parseListCell('["a", "b"]')).toEqual({ items: ['a', 'b'] });
    expect(fns.parseListCell("['a']").error).toMatch(/JSON list/);
    expect(fns.parseListCell('a, b').error).toMatch(/JSON list/);
    expect(fns.parseListCell(5).error).toMatch(/JSON list/);
  });

  test('toLinkLookupPath turns uuids, aliases, paths and URLs into encoded lookup paths', () => {
    const prefixes = [ENDPOINT, 'https://sandbox.lattice-data.org'];
    expect(fns.toLinkLookupPath('doc-1', prefixes)).toBe('/doc-1/');
    expect(fns.toLinkLookupPath('lab:doc 1', prefixes)).toBe('/lab%3Adoc%201/');
    expect(fns.toLinkLookupPath('/documents/doc-1', prefixes)).toBe('/documents/doc-1/');
    expect(fns.toLinkLookupPath('/documents/lab:my doc/', prefixes)).toBe('/documents/lab%3Amy%20doc/');
    expect(fns.toLinkLookupPath('/documents/lab%3Amy%20doc/', prefixes)).toBe('/documents/lab%3Amy%20doc/');
    expect(fns.toLinkLookupPath('https://sandbox.lattice-data.org/documents/doc-1/', prefixes)).toBe(
      '/documents/doc-1/'
    );
  });

  test('ETag helpers find the header in any case and send back the strong form', () => {
    expect(fns.getHeaderValue({ etag: '"u=1"' }, 'ETag')).toBe('"u=1"');
    expect(fns.getHeaderValue({}, 'ETag')).toBeNull();
    expect(fns.toIfMatchValue('W/"u=1"')).toBe('"u=1"');
  });
});

describe('appendToListsInSheet', () => {
  const makeGrid = () => [
    ['uuid', 'aliases', 'documents', '#skip', 'description'],
    ['bs-1', '["lab:b"]', '', '', '=A2&"-x"'], // row 2: adds lab:b
    ['bs-2', '["lab:a"]', '', '', ''], // row 3: already there
    ['bs-3', '["lab:x"]', '', '1', ''], // row 4: #skip
    ['', '["lab:y"]', '', '', ''], // row 5: nothing to find the object by
    ['bs-4', "['bad']", '', '', ''], // row 6: not a JSON list
    ['bs-5', '', '["lab:doc9", "/documents/doc-1/"]', '', ''], // row 7: links
    ['bs-6', '["lab:c"]', '', '', ''], // row 8: a colleague edits it mid-run
    ['bs-7', '["lab:z"]', '', '', ''], // row 9: hidden
  ];
  const makeObjects = () => ({
    'bs-1': { uuid: 'bs-1', aliases: ['lab:a'] },
    'bs-2': { uuid: 'bs-2', aliases: ['lab:a'] },
    'bs-5': { uuid: 'bs-5', documents: ['/documents/doc-1/'] },
    'bs-6': { uuid: 'bs-6', aliases: [] },
    'bs-7': { uuid: 'bs-7', aliases: [] },
  });
  const portalOptions = {
    weakEtag: true, // nginx weakens ETags on gzipped responses
    lookups: { '/lab%3Adoc9/': '/documents/doc-9/' },
    afterFirstRead: {
      'bs-6': (obj) => {
        obj.aliases.push('lab:colleague');
      },
    },
  };

  test('appends, keeps concurrent edits, and writes the merged lists back', () => {
    const portal = makePortal(makeObjects(), portalOptions);
    const { run, requests, grid, writes } = setUp(makeGrid(), portal, { hiddenRows: [9] });

    expect(run()).toEqual(outcome({ total: 6, done: 6, changed: 3, unchanged: 1, failed: 2 }));

    // Portal: only additions, and the colleague's alias survived the retry.
    expect(portal.objects['bs-1'].aliases).toEqual(['lab:a', 'lab:b']);
    expect(portal.objects['bs-2'].aliases).toEqual(['lab:a']);
    expect(portal.objects['bs-5'].documents).toEqual(['/documents/doc-1/', '/documents/doc-9/']);
    expect(portal.objects['bs-6'].aliases).toEqual(['lab:colleague', 'lab:c']);
    expect(portal.objects['bs-7'].aliases).toEqual([]);

    // PATCH sends only the changed list, with Basic auth and a strong If-Match.
    const first = patches(requests)[0];
    expect(JSON.parse(first.payload)).toEqual({ aliases: ['lab:a', 'lab:b'] });
    expect(first.headers['If-Match']).toBe('"bs-1=1"');
    expect(first.headers.Authorization).toMatch(/^Basic /);
    expect(patches(requests).map((r) => r.url.split('/').pop())).toEqual(['bs-1', 'bs-5', 'bs-6', 'bs-6']);

    // Cells show the portal's list for rows that worked; failed rows keep theirs.
    expect(grid[1][1]).toBe('["lab:a","lab:b"]');
    expect(grid[2][1]).toBe('["lab:a"]');
    expect(grid[4][1]).toBe('["lab:y"]');
    expect(grid[5][1]).toBe("['bad']");
    expect(grid[6][2]).toBe('["/documents/doc-1/","/documents/doc-9/"]');
    expect(grid[7][1]).toBe('["lab:colleague","lab:c"]');

    // #response explains each row.
    expect(grid[0].slice(5)).toEqual(['#response', '#response_time']);
    expect(grid[1][5]).toBe('APPEND,200\naliases: added lab:b');
    expect(grid[2][5]).toBe('APPEND,no change\naliases: already there: lab:a');
    expect(grid[4][5]).toBe('APPEND,error\nMissing a value to find the object by (uuid).');
    expect(grid[5][5]).toMatch(/^APPEND,error\naliases: expected a JSON list/);
    expect(grid[6][5]).toBe('APPEND,200\ndocuments: added /documents/doc-9/; already there: /documents/doc-1/');
    expect(grid[7][5]).toBe('APPEND,200\naliases: added lab:c');

    // #skip and hidden rows, and columns we don't own, are never written.
    expect(touchesRow(writes, 4)).toBe(false);
    expect(touchesRow(writes, 9)).toBe(false);
    expect(touchesCol(writes, 1)).toBe(false);
    expect(touchesCol(writes, 4)).toBe(false);
    expect(touchesCol(writes, 5)).toBe(false);
    expect(grid[1][4]).toBe('=A2&"-x"');
  });

  test('running it again changes nothing and needs no link lookups', () => {
    const portal = makePortal(makeObjects(), portalOptions);
    const { run, requests } = setUp(makeGrid(), portal, { hiddenRows: [9] });
    run();
    const before = requests.length;

    expect(run()).toEqual(outcome({ total: 6, done: 6, unchanged: 4, failed: 2 }));
    const second = requests.slice(before);
    expect(patches(second)).toEqual([]);
    expect(second.filter((r) => r.url.includes('frame=object'))).toEqual([]);
  });

  test('finds an object by its first alias, URL-encoded, when appending to another list', () => {
    const portal = makePortal(
      { 'lab:bs 5': { documents: [] } },
      { lookups: { '/documents/doc-1/': '/documents/doc-1/' } }
    );
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'aliases', 'documents'],
        ['', '["lab:bs 5", "lab:other"]', '["/documents/doc-1/"]'],
      ],
      portal,
      { listProps: ['documents'] }
    );

    expect(run().changed).toBe(1);
    expect(edits(requests)[0].url).toBe(`${ENDPOINT}/biosample/lab%3Abs%205/@@edit?format=json`);
    expect(patches(requests)[0].url).toBe(`${ENDPOINT}/biosample/lab%3Abs%205`);
    expect(portal.objects['lab:bs 5'].documents).toEqual(['/documents/doc-1/']);
    expect(grid[1][1]).toBe('["lab:bs 5", "lab:other"]');
  });

  test('rows for the same object go out as one PATCH, and each row reports its own items', () => {
    const portal = makePortal({ 'bs-1': { aliases: ['lab:a'] } });
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'aliases'],
        ['bs-1', '["lab:b"]'],
        ['bs-1', '["lab:c"]'],
        ['bs-1', '["lab:a"]'],
        ['bs-1', '["lab:d"]'],
        ['bs-1', '["lab:b", "lab:e"]'],
      ],
      portal,
      { listProps: ['aliases'] }
    );

    expect(run()).toEqual(outcome({ total: 5, done: 5, changed: 4, unchanged: 1 }));
    expect(edits(requests)).toHaveLength(1);
    expect(patches(requests)).toHaveLength(1);
    expect(portal.objects['bs-1'].aliases).toEqual(['lab:a', 'lab:b', 'lab:c', 'lab:d', 'lab:e']);
    grid.slice(1).forEach((row) => expect(row[1]).toBe('["lab:a","lab:b","lab:c","lab:d","lab:e"]'));
    expect(grid[3][2]).toBe('APPEND,no change\naliases: already there: lab:a');
    expect(grid[5][2]).toBe('APPEND,200\naliases: added lab:b, lab:e');
  });

  test('rows sorted during the run are left alone, and a re-run finishes them without mixing objects up', () => {
    const portal = makePortal(
      { 'bs-1': { documents: [] }, 'bs-2': { documents: [] } },
      { lookups: { '/documents/doc-a/': '/documents/doc-a/', '/documents/doc-b/': '/documents/doc-b/' } }
    );
    const { run, grid, writes } = setUp(
      [
        ['uuid', 'documents'],
        ['bs-1', '["/documents/doc-a/"]'],
        ['bs-2', '["/documents/doc-b/"]'],
      ],
      portal,
      { listProps: ['documents'] }
    );
    let sorted = false;
    portal.hooks.beforePatch = () => {
      if (!sorted) {
        sorted = true;
        [grid[1], grid[2]] = [grid[2], grid[1]];
      }
    };

    expect(run()).toEqual(outcome({ total: 2, done: 2, moved: 2 }));
    expect(writes.filter((w) => w.row > 1)).toEqual([]);
    expect(grid[1]).toEqual(['bs-2', '["/documents/doc-b/"]']);
    expect(grid[2]).toEqual(['bs-1', '["/documents/doc-a/"]']);

    expect(run()).toEqual(outcome({ total: 2, done: 2, unchanged: 2 }));
    expect(portal.objects['bs-1'].documents).toEqual(['/documents/doc-a/']);
    expect(portal.objects['bs-2'].documents).toEqual(['/documents/doc-b/']);
    expect(grid[1][1]).toBe('["/documents/doc-b/"]');
    expect(grid[2][1]).toBe('["/documents/doc-a/"]');
  });

  test('a column inserted during the run does not shift where the results go', () => {
    const portal = makePortal({ 'bs-1': { aliases: ['lab:a'] } });
    const { run, grid } = setUp(
      [
        ['uuid', 'aliases'],
        ['bs-1', '["lab:b"]'],
      ],
      portal,
      { listProps: ['aliases'] }
    );
    portal.hooks.beforePatch = () => {
      if (grid[0][0] !== 'notes') {
        grid.forEach((row, i) => row.unshift(i === 0 ? 'notes' : 'kept'));
      }
    };

    expect(run().changed).toBe(1);
    expect(grid[0].slice(0, 5)).toEqual(['notes', 'uuid', 'aliases', '#response', '#response_time']);
    expect(grid[1].slice(0, 4)).toEqual(['kept', 'bs-1', '["lab:a","lab:b"]', 'APPEND,200\naliases: added lab:b']);
  });

  test('a row edited before its batch runs is not sent, so the edit is kept', () => {
    const grid = manyRows(31, ['uuid', 'aliases'], (id) => [id, '["lab:new"]']);
    const objects = {};
    grid.slice(1).forEach(([id]) => {
      objects[id] = { aliases: [] };
    });
    const portal = makePortal(objects);
    const fake = setUp(grid, portal, { listProps: ['aliases'] });
    portal.hooks.beforePatch = () => {
      fake.grid[31][1] = '["lab:edited"]';
    };

    expect(fake.run()).toEqual(outcome({ total: 31, done: 31, changed: 30, moved: 1 }));
    expect(patches(fake.requests).map((r) => r.url.split('/').pop())).not.toContain('bs-31');
    expect(portal.objects['bs-31'].aliases).toEqual([]);
    expect(fake.grid[31][1]).toBe('["lab:edited"]');
  });

  test('a temporary lookup failure is retried, not remembered as "not found"', () => {
    const portal = makePortal(
      { 'bs-1': { documents: [] } },
      { lookups: { '/lab%3Adoc9/': '/documents/doc-9/' }, lookupFailures: { '/lab%3Adoc9/': 1 } }
    );
    const { run } = setUp(
      [
        ['uuid', 'documents'],
        ['bs-1', '["lab:doc9"]'],
      ],
      portal,
      { listProps: ['documents'] }
    );

    expect(run().changed).toBe(1);
    expect(portal.lookupCalls['/lab%3Adoc9/']).toBe(2);
    expect(portal.objects['bs-1'].documents).toEqual(['/documents/doc-9/']);
  });

  test('a lookup that keeps failing only fails its own batch; the next batch looks it up again', () => {
    const grid = manyRows(31, ['uuid', 'documents'], (id) => [id, '["lab:doc9"]']);
    const objects = {};
    grid.slice(1).forEach(([id]) => {
      objects[id] = { documents: [] };
    });
    const portal = makePortal(objects, {
      lookups: { '/lab%3Adoc9/': '/documents/doc-9/' },
      lookupFailures: { '/lab%3Adoc9/': 2 },
    });
    const fake = setUp(grid, portal, { listProps: ['documents'] });

    expect(fake.run()).toEqual(outcome({ total: 31, done: 31, changed: 1, failed: 30 }));
    expect(portal.lookupCalls['/lab%3Adoc9/']).toBe(3);
    expect(fake.grid[1][2]).toMatch(/Could not check these on the portal.*lab:doc9 \(HTTP 503\)/);
    expect(portal.objects['bs-31'].documents).toEqual(['/documents/doc-9/']);
  });

  test('refuses to write when the portal sends no ETag', () => {
    const portal = makePortal({ 'bs-1': { aliases: ['lab:a'] } }, { dropEtag: true });
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'aliases'],
        ['bs-1', '["lab:b"]'],
      ],
      portal,
      { listProps: ['aliases'] }
    );

    expect(run().failed).toBe(1);
    expect(patches(requests)).toEqual([]);
    expect(grid[1][1]).toBe('["lab:b"]');
    expect(grid[1][2]).toMatch(/version stamp \(ETag\)/);
  });

  test('gives up after three conflicts and leaves the cell as it was', () => {
    const portal = makePortal({ 'bs-1': { aliases: ['lab:a'] } }, { alwaysConflict: true });
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'aliases'],
        ['bs-1', '["lab:b"]'],
      ],
      portal,
      { listProps: ['aliases'] }
    );

    expect(run().failed).toBe(1);
    expect(patches(requests)).toHaveLength(3);
    expect(portal.objects['bs-1'].aliases).toEqual(['lab:a']);
    expect(grid[1][1]).toBe('["lab:b"]');
    expect(grid[1][2]).toMatch(/^APPEND,412\n/);
  });

  test('reports a link that the portal cannot find, without writing', () => {
    const portal = makePortal({ 'bs-1': { documents: [] } });
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'documents'],
        ['bs-1', '["lab:missing"]'],
      ],
      portal,
      { listProps: ['documents'] }
    );

    expect(run().failed).toBe(1);
    expect(patches(requests)).toEqual([]);
    expect(grid[1][2]).toMatch(/Not found on the portal.*lab:missing/);
  });
});

describe('patchSelectedAppend (menu entry)', () => {
  function setUpMenu(selected) {
    const fns = loadFunctions(FILES.concat(['UserInterface.js']), credentialGlobals);
    const { sheet } = makeFakeSheet([
      ['uuid', 'aliases', 'description'],
      ['bs-1', '["lab:b"]', 'd'],
    ]);
    const alerts = [];
    const calls = [];
    Object.assign(fns, {
      checkProfile: () => true,
      getCurrentSheet: () => sheet,
      getProfile: () => PROFILE,
      getProfileName: () => 'biosample',
      getEndpoint: () => ENDPOINT,
      getSelectedColumns: () => selected,
      alertBox: (message) => alerts.push(message),
      alertBoxOkCancel: () => true,
      appendToListsInSheet: (...args) => {
        calls.push(args.slice(1));
        return { total: 1, done: 1, changed: 1, unchanged: 0, failed: 0, moved: 0, stoppedEarly: false };
      },
    });
    return { fns, alerts, calls };
  }

  test('refuses columns that are not lists, naming them', () => {
    const { fns, alerts, calls } = setUpMenu([
      { col: 2, headerProp: 'aliases' },
      { col: 3, headerProp: 'description' },
    ]);
    fns.patchSelectedAppend();
    expect(calls).toEqual([]);
    expect(alerts[0]).toMatch(/not lists:\n\ndescription\n/);
  });

  test('appends to each selected list once and reports the result', () => {
    const { fns, alerts, calls } = setUpMenu([
      { col: 2, headerProp: 'aliases' },
      { col: 2, headerProp: 'aliases' },
    ]);
    fns.patchSelectedAppend();
    expect(calls).toEqual([['biosample', ENDPOINT, ['aliases']]]);
    expect(alerts).toEqual([`Appended to lists on ${ENDPOINT}: 1 row(s) changed, 0 already up to date, 0 failed.`]);
  });
});

describe('lists spread over several columns', () => {
  // Aliases about as long as Lattice's: roughly 480 fit in a cell, so 1,000 need three.
  const longAliases = (n) =>
    Array.from({ length: n }, (_, i) => `lab:${'sample-'.repeat(10)}${String(i).padStart(5, '0')}`);
  const partCells = (fns, grid, prop) =>
    fns.listColumnHeaders(grid[0], prop).map((name) => grid[1][grid[0].indexOf(name)]);

  test('adds the items from every part and writes the merged list back over as many columns as needed', () => {
    const portal = makePortal({ 'bs-1': { uuid: 'bs-1', aliases: longAliases(1000) } });
    const { fns, run, grid } = setUp(
      [
        ['uuid', 'aliases', 'aliases#2', 'description'],
        ['bs-1', '["lab:new-1"]', '["lab:new-2", "lab:new-3"]', 'keep'],
      ],
      portal,
      { listProps: ['aliases'] }
    );

    expect(run()).toEqual(outcome({ total: 1, done: 1, changed: 1 }));
    expect(portal.objects['bs-1'].aliases).toEqual(longAliases(1000).concat(['lab:new-1', 'lab:new-2', 'lab:new-3']));

    expect(fns.listColumnHeaders(grid[0], 'aliases')).toEqual(['aliases', 'aliases#2', 'aliases#3']);
    const cells = partCells(fns, grid, 'aliases');
    cells.forEach((cell) => expect(cell.length).toBeLessThanOrEqual(40000));
    expect(cells.flatMap((cell) => JSON.parse(cell))).toEqual(portal.objects['bs-1'].aliases);
    expect(grid[1][3]).toBe('keep');
    expect(grid[1][grid[0].indexOf('#response')]).toBe('APPEND,200\naliases: added lab:new-1, lab:new-2, lab:new-3');
  });

  test('a part that is not a JSON list fails the row, naming the column', () => {
    const portal = makePortal({ 'bs-1': { aliases: ['lab:a'] } });
    const { run, grid } = setUp(
      [
        ['uuid', 'aliases', 'aliases#2'],
        ['bs-1', '["lab:b"]', "['bad']"],
      ],
      portal,
      { listProps: ['aliases'] }
    );

    expect(run()).toEqual(outcome({ total: 1, done: 1, failed: 1 }));
    expect(portal.objects['bs-1'].aliases).toEqual(['lab:a']);
    expect(grid[1].slice(0, 3)).toEqual(['bs-1', '["lab:b"]', "['bad']"]);
    expect(grid[1][3]).toMatch(/^APPEND,error\naliases#2: expected a JSON list/);
  });

  test('an edit to a continuation cell during the run leaves the row alone', () => {
    const portal = makePortal({ 'bs-1': { aliases: [] } });
    const fake = setUp(
      [
        ['uuid', 'aliases', 'aliases#2'],
        ['bs-1', '["lab:a"]', '["lab:b"]'],
      ],
      portal,
      { listProps: ['aliases'] }
    );
    portal.hooks.beforePatch = () => {
      fake.grid[1][2] = '["lab:edited"]';
    };

    expect(fake.run()).toEqual(outcome({ total: 1, done: 1, moved: 1 }));
    expect(fake.writes.filter((w) => w.row > 1)).toEqual([]);
    expect(fake.grid[1]).toEqual(['bs-1', '["lab:a"]', '["lab:edited"]']);

    expect(fake.run()).toEqual(outcome({ total: 1, done: 1, changed: 1 }));
    expect(portal.objects['bs-1'].aliases).toEqual(['lab:a', 'lab:b', 'lab:edited']);
    expect(fake.grid[1].slice(0, 3)).toEqual(['bs-1', '["lab:a","lab:b","lab:edited"]', '']);
  });
});

describe('lists of links as uuids', () => {
  const u1 = '00000000-0000-4000-8000-000000000001';
  const u2 = '00000000-0000-4000-8000-000000000002';

  test('a uuid the portal has as a path needs no lookup, and the merged list is written back as uuids', () => {
    const portal = makePortal(
      { 'bs-1': { documents: [`/documents/${u1}/`, '/documents/doc-1/'] } },
      { lookups: { [`/${u2}/`]: `/documents/${u2}/` } }
    );
    const { run, requests, grid } = setUp(
      [
        ['uuid', 'documents'],
        ['bs-1', `["${u1}", "${u2}", "doc-1"]`],
      ],
      portal,
      { listProps: ['documents'] }
    );

    expect(run()).toEqual(outcome({ total: 1, done: 1, changed: 1 }));
    expect(portal.lookupCalls).toEqual({ [`/${u2}/`]: 1 });
    expect(portal.objects['bs-1'].documents).toEqual([`/documents/${u1}/`, '/documents/doc-1/', `/documents/${u2}/`]);
    expect(grid[1][1]).toBe(`["${u1}","/documents/doc-1/","${u2}"]`);
    expect(grid[1][2]).toBe(
      `APPEND,200\ndocuments: added /documents/${u2}/; already there: /documents/${u1}/, /documents/doc-1/`
    );

    // Running it again with the written-back cell: nothing to add, nothing to look up.
    const before = requests.length;
    expect(run()).toEqual(outcome({ total: 1, done: 1, unchanged: 1 }));
    expect(requests.slice(before).filter((r) => r.url.includes('frame=object'))).toEqual([]);
    expect(patches(requests.slice(before))).toEqual([]);
  });
});
