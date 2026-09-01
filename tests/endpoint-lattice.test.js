const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const endpointPath = path.join(root, 'functions', 'Endpoint.js');
const connectionPath = path.join(root, 'functions', 'Connection.js');
const sheetDataPath = path.join(root, 'functions', 'SheetData.js');

const read = (p) => fs.readFileSync(p, 'utf8');

test('Endpoint.js is Lattice-only (no ENCODE/IGVF endpoint lists)', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).not.toContain('ENCODE_ENDPOINTS');
  expect(endpoint).not.toContain('IGVF_ENDPOINTS');
  expect(endpoint).not.toContain('ALL_ENCODE_PROFILES');
  expect(endpoint).not.toContain('ALL_IGVF_PROFILES');
  expect(endpoint).not.toContain('getIgvfEndpointsAvailableForUsers');
  expect(endpoint).toContain('ENDPOINT_LATTICE_DEV');
  expect(endpoint).toContain('https://lattice-api-dev.demo.lattice-data.org');
});

test('Official LATTICE_ENDPOINTS list the four primary API bases (regex not required)', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toContain('"https://lattice-api-dev.demo.lattice-data.org"');
  expect(endpoint).toContain('"https://api.sandbox.lattice-data.org"');
  expect(endpoint).toContain('"https://api.staging.lattice-data.org"');
  expect(endpoint).toContain('"https://api.data.lattice-data.org"');
});

test('Lattice dev API is listed for users (no filter hiding dev)', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toMatch(
    /function getLatticeEndpointsAvailableForUsers\(\)\s*\{\s*return LATTICE_ENDPOINTS;\s*\}/,
  );
  expect(endpoint).not.toContain('filter(e => e !== ENDPOINT_LATTICE_DEV)');
});

test('Endpoint.js documents optional HTTPS *.demo.lattice-data.org API bases', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toContain('ADDITIONAL_LATTICE_API_ENDPOINT_REGEX');
  expect(endpoint).toContain('.demo\\.lattice-data\\.org');
});

test('Default read/write endpoints are Lattice sandbox', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toContain('const DEFAULT_ENDPOINT_READ = ENDPOINT_LATTICE_SANDBOX;');
  expect(endpoint).toContain('const DEFAULT_ENDPOINT_WRITE = ENDPOINT_LATTICE_SANDBOX;');
});

test('Connection.js stores credentials only for Lattice', () => {
  const conn = read(connectionPath);
  expect(conn).toContain('PROPERTY_LATTICE_USERNAME');
  expect(conn).not.toContain('PROPERTY_ENCODE_USERNAME');
  expect(conn).not.toContain('PROPERTY_IGVF_USERNAME');
  expect(conn).toContain('function getUsername()');
  expect(conn).toContain('function getPassword()');
});

test('getAllProfiles delegates to dynamic resolver', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toContain('return getResolvedProfileSlugList(endpoint);');
});

test('Set endpoint dialog lists only supported Lattice API bases', () => {
  const sheet = read(sheetDataPath);
  expect(sheet).toContain('* Supported Lattice API endpoints:');
  expect(sheet).not.toContain('Supported IGVF');
  expect(sheet).not.toContain('getIgvfEndpointsAvailableForUsers');
  expect(sheet).toContain('getLatticeEndpointsAvailableForUsers().join');
});

test('ALL_LATTICE_PROFILES includes source and template exclusion list omits IGVF leftovers', () => {
  const endpoint = read(endpointPath);
  expect(endpoint).toContain('"source",');
  expect(endpoint).toMatch(/const LATTICE_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION = \[[\s\S]*?"source",/);
  expect(endpoint).not.toContain('"award",');
  expect(endpoint).not.toContain('"gene",');
});
