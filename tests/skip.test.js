const { loadFunctions } = require('./support/apps-script-sandbox');

const FILES = ['Library.js', 'Endpoint.js', 'Sheet.js', 'Metadata.js', 'Profile.js'];

test.each([[''], [' '], ['0'], [0], ['false'], ['FALSE'], [false], ['no'], ['No'], ['n'], ['f'], [null], [undefined]])(
  '#skip value %p does not skip the row',
  (value) => {
    expect(loadFunctions(FILES).isSkipValue(value)).toBe(false);
  }
);

test.each([['1'], [1], ['true'], [true], ['yes'], ['x'], ['X'], ['skip'], ['o']])(
  '#skip value %p skips the row',
  (value) => {
    expect(loadFunctions(FILES).isSkipValue(value)).toBe(true);
  }
);

test('POST, PATCH and PUT leave out every row whose #skip says to skip it', () => {
  const fns = loadFunctions(FILES, { Logger: { log: () => {} } });
  const skipValues = ['1', 'yes', 'x', true, '0', 'no', false, ''];
  const sheetData = {
    header: ['#skip', 'description'],
    values: skipValues.map((value, i) => [value, `row ${i + 2}`]),
    displayValues: skipValues.map((value, i) => [String(value), `row ${i + 2}`]),
    hiddenRows: skipValues.map(() => false),
  };
  const profile = { identifyingProperties: ['uuid'], properties: { description: { type: 'string' } } };

  const items = fns.buildSubmissionItems(null, sheetData, profile, 'biosample', 'https://x', 'POST', []);
  expect(items.map((item) => item.row)).toEqual([6, 7, 8, 9]);
});
