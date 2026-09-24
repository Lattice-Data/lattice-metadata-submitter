const {
  loadFunctions,
  makeFakeSheet,
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
  },
};

test('makeMetadataUrl URL-encodes identifiers, e.g. an alias with a space', () => {
  const fns = loadFunctions(FILES);
  expect(fns.makeMetadataUrl('GET', 'biosample', ENDPOINT, 'lattice:sample 1')).toBe(
    `${ENDPOINT}/biosample/lattice%3Asample%201/?format=json&frame=object`
  );
  expect(fns.makeMetadataUrl('PATCH', 'biosample', ENDPOINT, 'lattice:sample 1')).toBe(
    `${ENDPOINT}/biosample/lattice%3Asample%201`
  );
  expect(fns.makeMetadataUrl('POST', 'biosample', ENDPOINT)).toBe(`${ENDPOINT}/biosample`);
});

test('GET keeps a row as it is when the portal answers with an error, JSON or not', () => {
  const answers = {
    [`${ENDPOINT}/biosample/u-1/?format=json&frame=object`]: {
      code: 502,
      body: '<html><body>502 Bad Gateway</body></html>',
    },
    [`${ENDPOINT}/biosample/lattice%3Asample%201/?format=json&frame=object`]: {
      code: 200,
      body: { '@id': '/biosamples/u-3/', uuid: 'u-3', aliases: ['lattice:sample 1'], description: 'new' },
    },
    [`${ENDPOINT}/biosample/u-4/?format=json&frame=object`]: {
      code: 404,
      body: { status: 'error', title: 'Not Found' },
    },
  };
  const { UrlFetchApp, requests } = makeFakeUrlFetchApp((req) => answers[req.url] || { code: 500, body: {} });
  const fns = loadFunctions(FILES, { UrlFetchApp, Logger: { log: () => {} }, ...credentialGlobals });
  fns.getProfile = () => PROFILE;
  fns.setLastUsedSchemaVersion = () => {};
  const { sheet, grid } = makeFakeSheet([
    ['uuid', 'aliases', 'description', '#response'],
    ['u-1', '', 'keep me', ''], // row 2: the portal sends an HTML 502 page
    ['', '["lattice:sample 1"]', 'old', ''], // row 3: found by an alias with a space
    ['', 'lattice:bare', 'keep too', ''], // row 4: aliases isn't a JSON list, so nothing to find it by
    ['u-4', '', 'x', ''], // row 5: the portal answers 404
  ]);

  expect(fns.updateSheetWithMetadataFromPortal(sheet, 'biosample', ENDPOINT, ENDPOINT)).toEqual({
    updated: 1,
    failed: 2,
  });
  expect(requests.map((r) => r.url)).toEqual(Object.keys(answers));

  expect(grid[1].slice(0, 3)).toEqual(['u-1', '', 'keep me']);
  expect(grid[1][3]).toMatch(/^GET,502\nThe portal's answer wasn't JSON:\n<html>/);
  expect(grid[2].slice(0, 4)).toEqual(['u-3', '["lattice:sample 1"]', 'new', 'GET,200']);
  expect(grid[3]).toEqual(['', 'lattice:bare', 'keep too', '']);
  expect(grid[4].slice(0, 3)).toEqual(['u-4', '', 'x']);
  expect(grid[4][3]).toMatch(/^GET,404\n\{/);
});
