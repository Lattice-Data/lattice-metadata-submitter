const fs = require('fs');
const path = require('path');
const vm = require('vm');

const parsePath = path.join(__dirname, '..', 'functions', 'ProfileSlugParse.js');

function loadParser() {
  const code = fs.readFileSync(parsePath, 'utf8');
  const sandbox = { JSON, Object, Array };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.parseProfileSlugsFromProfilesResponse;
}

test('parseProfileSlugsFromProfilesResponse collects @id profile paths', () => {
  const parse = loadParser();
  const fixture = {
    '@graph': [
      { '@id': 'https://api.data.lattice-data.org/profiles/document.json' },
      { '@id': 'https://api.data.lattice-data.org/profiles/sequence_file.json' },
      { '@id': 'https://api.data.lattice-data.org/schemas/document.json' },
    ],
  };
  expect(parse(JSON.stringify(fixture))).toEqual(['document', 'sequence_file']);
});

test('parseProfileSlugsFromProfilesResponse returns empty on invalid JSON', () => {
  const parse = loadParser();
  expect(parse('not json')).toEqual([]);
});
