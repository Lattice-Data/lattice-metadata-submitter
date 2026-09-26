const {
  loadFunctions,
  makeFakeSheet,
  makeFakeUrlFetchApp,
  credentialGlobals,
} = require('./support/apps-script-sandbox');

// The Ajv validator bundled into code.gs, so uniqueItems is checked for real.
require('../src/server/jsonSchema');

const FILES = ['Library.js', 'Endpoint.js', 'Sheet.js', 'Metadata.js', 'Profile.js', 'Connection.js', 'ListColumns.js'];
const ENDPOINT = 'https://api.sandbox.lattice-data.org';
// Sheets' limit is 50,000 characters; the tool stays under this (see ListColumns.js).
const CELL_MAX = 40000;

// Like the Lattice sequence_file schema: derived_from links files and must not repeat.
const PROFILE = {
  identifyingProperties: ['uuid', 'aliases'],
  required: ['derived_from'],
  properties: {
    schema_version: { type: 'string', default: '1' },
    uuid: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    derived_from: { type: 'array', uniqueItems: true, items: { type: 'string', linkTo: 'File' } },
    description: { type: 'string' },
  },
};

// n uuid-like ids, "00000000-0000-4000-8000-000000000001" on, bare and as Lattice @id paths.
const uuids = (n) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const paths = (n) => uuids(n).map((uuid) => `/sequence_files/${uuid}/`);
// The list held by a property's cells, first part to last.
const joinCells = (cells) => cells.filter((cell) => cell !== '').flatMap((cell) => JSON.parse(cell));

describe('continuation headers', () => {
  const fns = loadFunctions(FILES);

  test('parseContinuationHeader accepts prop#2 and up, nothing else', () => {
    expect(fns.parseContinuationHeader('derived_from#2')).toEqual({ base: 'derived_from', part: 2 });
    expect(fns.parseContinuationHeader('derived_from#10')).toEqual({ base: 'derived_from', part: 10 });
    expect(fns.parseContinuationHeader(' aliases#3 ')).toEqual({ base: 'aliases', part: 3 });
    ['derived_from', 'derived_from#1', 'derived_from#0', 'derived_from#', '#skip', '#skip#2', 'a b#2', 'a#b#2', '', 42, null]
      .forEach((header) => expect(fns.parseContinuationHeader(header)).toBeNull());
    expect(fns.baseHeaderProp('derived_from#2')).toBe('derived_from');
    expect(fns.baseHeaderProp('#skip')).toBe('#skip');
  });

  test("listColumnHeaders lists a property's columns in part order, wherever they are", () => {
    const header = ['uuid', 'derived_from#3', 'description', 'derived_from', 'derived_from#2', 'aliases#2'];
    expect(fns.listColumnHeaders(header, 'derived_from')).toEqual(['derived_from', 'derived_from#2', 'derived_from#3']);
    expect(fns.listColumnHeaders(header, 'aliases')).toEqual(['aliases#2']);
    expect(fns.listColumnHeaders(header, 'description')).toEqual(['description']);
    expect(fns.describePropsWithColumns(['derived_from', 'description'], header)).toBe(
      'derived_from (3 columns), description'
    );
  });

  test('selecting any part of a list selects the whole list, once', () => {
    const selected = [
      { col: 5, headerProp: 'derived_from#2' },
      { col: 4, headerProp: 'derived_from' },
      { col: 3, headerProp: 'description' },
      { col: 2, headerProp: 'derived_from#3' },
    ];
    expect(fns.selectedBaseProps(selected)).toEqual(['derived_from', 'description']);
  });
});

describe('splitting and spreading lists', () => {
  const fns = loadFunctions(FILES);

  test('splitListForCells keeps every part within the limit, in order, losing nothing', () => {
    expect(fns.splitListForCells([])).toEqual(['[]']);
    expect(fns.splitListForCells(['a', 'b'])).toEqual(['["a","b"]']);

    const list = paths(3000);
    const parts = fns.splitListForCells(list);
    expect(parts).toHaveLength(5);
    parts.forEach((part) => expect(part.length).toBeLessThanOrEqual(CELL_MAX));
    expect(joinCells(parts)).toEqual(list);
    // A part is filled before the next one starts: one more item would not have fit.
    expect(parts[0].length + JSON.stringify(list[0]).length + 1).toBeGreaterThan(CELL_MAX);
  });

  test('splitListForCells gives an item longer than the limit a part of its own', () => {
    expect(fns.splitListForCells(['x'.repeat(30), 'y', 'z'], 20)).toEqual([`["${'x'.repeat(30)}"]`, '["y","z"]']);
  });

  test('spreadListValues splits a long list and blanks the parts a shorter list no longer needs', () => {
    const header = ['uuid', 'derived_from', 'derived_from#2', 'derived_from#3', 'aliases#2'];

    const long = fns.spreadListValues({ uuid: 'u-1', derived_from: paths(1000) }, header);
    expect(Object.keys(long)).toEqual(['uuid', 'derived_from', 'derived_from#2', 'derived_from#3']);
    expect(long.uuid).toBe('u-1');
    expect(joinCells([long.derived_from, long['derived_from#2']])).toEqual(paths(1000));
    expect(long['derived_from#3']).toBe('');

    // aliases#2 is left alone: aliases isn't being written.
    const short = fns.spreadListValues({ derived_from: paths(1), description: null }, header);
    expect(short).toEqual({
      derived_from: JSON.stringify(paths(1)),
      description: '',
      'derived_from#2': '',
      'derived_from#3': '',
    });
  });
});

describe('items of a list of links', () => {
  const fns = loadFunctions(FILES);
  const [u1, u2] = uuids(2);

  test('toShortLinkIdentifier keeps the uuid an @id path ends in and leaves anything else alone', () => {
    expect(fns.toShortLinkIdentifier(`/sequence_files/${u1}/`)).toBe(u1);
    expect(fns.toShortLinkIdentifier(`/documents/${u1.toUpperCase()}`)).toBe(u1.toUpperCase());
    expect(fns.toShortLinkIdentifier('/labs/alex-marson/')).toBe('/labs/alex-marson/');
    expect(fns.toShortLinkIdentifier('/awards/HG012345/')).toBe('/awards/HG012345/');
    expect(fns.toShortLinkIdentifier(u1)).toBe(u1);
    expect(fns.toShortLinkIdentifier('lab:alias')).toBe('lab:alias');
    expect(fns.toShortLinkIdentifier({ x: 1 })).toEqual({ x: 1 });
  });

  test('toCellLinkList converts lists of links only', () => {
    expect(fns.toCellLinkList(PROFILE, 'derived_from', [`/sequence_files/${u1}/`, '/labs/l/'])).toEqual([u1, '/labs/l/']);
    expect(fns.toCellLinkList(PROFILE, 'aliases', [`/x/${u1}/`])).toEqual([`/x/${u1}/`]);
    expect(fns.toCellLinkList(PROFILE, 'derived_from', `/sequence_files/${u1}/`)).toBe(`/sequence_files/${u1}/`);
  });

  test('findEquivalentLink finds the portal item a path or uuid names', () => {
    const current = [`/sequence_files/${u1}/`, '/labs/alex-marson/'];
    expect(fns.findEquivalentLink(current, `/sequence_files/${u1}/`)).toBe(`/sequence_files/${u1}/`);
    expect(fns.findEquivalentLink(current, ` ${u1} `)).toBe(`/sequence_files/${u1}/`);
    expect(fns.findEquivalentLink(current, 'alex-marson')).toBe('/labs/alex-marson/');
    expect(fns.findEquivalentLink(current, u2)).toBeNull();
    expect(fns.findEquivalentLink(current, 'lab:alias')).toBeNull();
    expect(fns.findEquivalentLink(current, '')).toBeNull();
  });
});

describe('reading a row', () => {
  const fns = loadFunctions(FILES);
  const read = (header, values) => fns.rowDataToJson(header, values, values.map(String), true, true);

  test('joins the parts in part order, whatever the column order, skipping empty parts', () => {
    const header = ['uuid', 'derived_from#3', 'derived_from', 'description', 'derived_from#2', 'derived_from#4'];
    expect(read(header, ['u-1', '["d"]', '["a"]', 'x', '["b","c"]', ''])).toEqual({
      uuid: 'u-1',
      derived_from: ['a', 'b', 'c', 'd'],
      description: 'x',
    });
  });

  test('a list may start in a later part, and all-empty parts leave the property out', () => {
    const header = ['uuid', 'derived_from', 'derived_from#2'];
    expect(read(header, ['u-1', '', '["b"]'])).toEqual({ uuid: 'u-1', derived_from: ['b'] });
    expect(read(header, ['u-1', '', ''])).toEqual({ uuid: 'u-1' });
  });

  test('a part that is not a JSON list is an error naming the column', () => {
    const header = ['uuid', 'derived_from', 'derived_from#2'];
    expect(() => read(header, ['u-1', '["a"]', 'b'])).toThrow(/^derived_from#2 must be a JSON list/);
    expect(() => read(header, ['u-1', 'a', '["b"]'])).toThrow(/^derived_from must be a JSON list/);
  });
});

describe('GET', () => {
  function setUp(objects, rows) {
    const { UrlFetchApp } = makeFakeUrlFetchApp((req) => {
      const m = req.url.match(/\/sequence_file\/([^/]+)\/\?format=json&frame=object$/);
      const object = m && objects[decodeURIComponent(m[1])];
      return object ? { code: 200, body: object } : { code: 404, body: { status: 'error', title: 'Not Found' } };
    });
    const fns = loadFunctions(FILES, { UrlFetchApp, Logger: { log: () => {} }, ...credentialGlobals });
    fns.getProfile = () => PROFILE;
    fns.setLastUsedSchemaVersion = () => {};
    const fake = makeFakeSheet(rows);
    const run = () => fns.updateSheetWithMetadataFromPortal(fake.sheet, 'sequence_file', ENDPOINT, ENDPOINT);
    return { fns, run, ...fake };
  }

  test('writes links as uuids over new columns, each within the limit, and blanks them for a shorter list', () => {
    const objects = {
      'u-1': { uuid: 'u-1', derived_from: paths(3000), description: 'long' },
      'u-2': { uuid: 'u-2', derived_from: paths(2), description: 'short' },
    };
    const { fns, run, grid, sheet } = setUp(objects, [
      ['uuid', 'derived_from', 'description'],
      ['u-1', '', ''],
      ['u-2', '', ''],
    ]);
    // Without the split the row would not fit: the fake sheet refuses oversized cells like Sheets does.
    expect(() => sheet.getRange(2, 2).setValues([[JSON.stringify(paths(3000))]])).toThrow(/50000 characters/);

    expect(run()).toEqual({ updated: 2, failed: 0 });

    const col = (name) => grid[0].indexOf(name);
    const partCells = (row) => fns.listColumnHeaders(grid[0], 'derived_from').map((name) => grid[row][col(name)]);
    // The portal's @id paths land as bare uuids: 3,000 of them take three columns.
    expect(fns.listColumnHeaders(grid[0], 'derived_from')).toEqual(['derived_from', 'derived_from#2', 'derived_from#3']);
    partCells(1).forEach((cell) => expect(cell.length).toBeLessThanOrEqual(CELL_MAX));
    expect(joinCells(partCells(1))).toEqual(uuids(3000));
    expect(grid[1][col('description')]).toBe('long');
    expect(grid[1][col('#response')]).toBe('GET,200');
    // The short list needs the first column only.
    expect(partCells(2)).toEqual([JSON.stringify(uuids(2)), '', '']);
    expect(grid[2][col('description')]).toBe('short');

    // The list shrinks on the portal: the next GET blanks the parts it no longer needs.
    objects['u-1'].derived_from = paths(1200);
    expect(run()).toEqual({ updated: 2, failed: 0 });
    expect(joinCells(partCells(1))).toEqual(uuids(1200));
    expect(partCells(1)[1]).not.toBe('');
    expect(partCells(1)[2]).toBe('');
    expect(grid[0]).toHaveLength(7);
  });
});

describe('POST, PATCH and Validate', () => {
  function setUp(rows, handler) {
    const { UrlFetchApp, requests } = makeFakeUrlFetchApp(handler);
    const documentProperties = {};
    const fns = loadFunctions(FILES, {
      UrlFetchApp,
      Logger: { log: () => {} },
      Utilities: credentialGlobals.Utilities,
      validateJson: global.validateJson,
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
    return { fns, requests, ...makeFakeSheet(rows) };
  }

  test('POST sends the joined list, reports a row whose part is not a list, and PATCH on one part sends it all', () => {
    let posted = 0;
    const { fns, requests, sheet, grid } = setUp(
      [
        ['aliases', 'derived_from', 'derived_from#2', 'description', '#skip'],
        ['["lab:a"]', '["/f/1/","/f/2/"]', '["/f/3/"]', 'd1', ''],
        ['["lab:b"]', '["/f/1/"]', 'not a list', 'd2', ''], // row 3: not sent
        ['["lab:c"]', '["/f/1/"]', 'not a list', 'd3', '1'], // row 4: #skip, so nothing to report
        ['["lab:d"]', '', '["/f/4/"]', 'd4', ''], // row 5: the list starts in the second part
      ],
      (req) => {
        if (req.method === 'POST') {
          posted += 1;
          return { code: 201, body: { status: 'success', '@graph': [{ uuid: `u-${posted}` }] } };
        }
        return { code: 200, body: { status: 'success' } };
      }
    );
    const col = (name) => grid[0].indexOf(name);
    const cell = (row, name) => grid[row][col(name)] ?? '';

    const post = fns.submitSheetToPortal(sheet, 'sequence_file', ENDPOINT, ENDPOINT, 'POST');
    expect(post.numSubmitted).toBe(2);
    expect(post.numUnreadable).toBe(1);
    expect(requests.filter((r) => r.method === 'POST').map((r) => JSON.parse(r.payload))).toEqual([
      { aliases: ['lab:a'], derived_from: ['/f/1/', '/f/2/', '/f/3/'], description: 'd1' },
      { aliases: ['lab:d'], derived_from: ['/f/4/'], description: 'd4' },
    ]);
    expect(cell(1, 'uuid')).toBe('u-1');
    expect(cell(4, 'uuid')).toBe('u-2');
    expect(cell(2, '#response')).toMatch(/^POST,error\nCould not read this row: Error: derived_from#2 must be a JSON list/);
    expect(cell(2, 'uuid')).toBe('');
    expect(cell(3, '#response')).toBe('');

    const patch = fns.submitSheetToPortal(sheet, 'sequence_file', ENDPOINT, ENDPOINT, 'PATCH', [
      { col: 3, headerProp: 'derived_from#2' },
    ]);
    expect(patch.numSubmitted).toBe(2);
    expect(requests.filter((r) => r.method === 'PATCH').map((r) => [r.url, JSON.parse(r.payload)])).toEqual([
      [`${ENDPOINT}/sequence_file/u-1`, { derived_from: ['/f/1/', '/f/2/', '/f/3/'] }],
      [`${ENDPOINT}/sequence_file/u-2`, { derived_from: ['/f/4/'] }],
    ]);
    expect(cell(1, '#response')).toBe('PATCH,200\nSelected props: derived_from');
    expect(cell(2, '#response')).toMatch(/^PATCH,error\nCould not read this row/);
  });

  test('Validate checks the joined list, so an item repeated across parts is reported', () => {
    const { fns, sheet, grid } = setUp(
      [
        ['aliases', 'derived_from', 'derived_from#2', 'description'],
        ['["lab:a"]', '["/f/1/","/f/2/"]', '["/f/2/"]', 'dup'],
        ['["lab:b"]', '["/f/1/"]', '["/f/3/"]', 'ok'],
      ],
      () => ({ code: 500, body: {} })
    );

    expect(fns.validateSheet(sheet, 'sequence_file', ENDPOINT)).toBe(2);
    const col = (name) => grid[0].indexOf(name);
    expect(grid[2][col('#response')]).toBe('ValidationSuccess');
    const errors = JSON.parse(grid[1][col('#response')]);
    expect(errors).toHaveLength(1);
    expect(errors[0].keyword).toBe('uniqueItems');
    expect(errors[0].instancePath).toBe('/derived_from');
  });
});

describe('header styling', () => {
  // The fake sheet plus the range styling calls that highlightHeaderAndDataCell makes.
  function makeStyledSheet(rows) {
    const fake = makeFakeSheet(rows);
    const styles = {};
    const getRange = fake.sheet.getRange;
    fake.sheet.getRange = (row, col, numRows, numCols) => {
      const style = (styles[`${row},${col}`] = styles[`${row},${col}`] || {});
      return Object.assign(getRange(row, col, numRows, numCols), {
        setNote: (v) => {
          style.note = v;
        },
        setFontColor: (v) => {
          style.color = v;
        },
        setFontStyle: (v) => {
          style.fontStyle = v;
        },
        setFontWeight: (v) => {
          style.fontWeight = v;
        },
        setFontLine: (v) => {
          style.fontLine = v;
        },
      });
    };
    return { ...fake, styles };
  }

  test('a continuation column is styled like its list; one for a non-list or unknown property is flagged', () => {
    const fns = loadFunctions(FILES, { Logger: { log: () => {}, info: () => {} } });
    const { sheet, styles } = makeStyledSheet([['uuid', 'derived_from', 'derived_from#2', 'description#2', 'bogus#2']]);

    expect(fns.highlightHeaderAndDataCell(sheet, PROFILE)).toEqual(['description#2', 'bogus#2']);

    expect(styles['1,2'].color).toBe('red');
    expect(styles['1,3']).toMatchObject({ color: 'red', fontStyle: 'italic', fontWeight: 'bold', fontLine: 'underline' });
    expect(styles['1,3'].note).toMatch(/^Part 2 of derived_from\./);
    expect(styles['1,3'].note).toContain('* linkTo\nFile');
    // Flagged columns are not styled at all.
    expect(styles['1,4']).toBeUndefined();
    expect(styles['1,5']).toBeUndefined();
  });
});
