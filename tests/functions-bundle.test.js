const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

beforeAll(() => {
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
});

test('dist/functions.js contains Lattice port markers', () => {
  const bundle = fs.readFileSync(path.join(root, 'dist', 'functions.js'), 'utf8');
  expect(bundle).toContain('ALL_LATTICE_PROFILES');
  expect(bundle).toContain('function authorizeForLattice');
  expect(bundle).toContain('getLatticeEndpointsAvailableForUsers');
  expect(bundle).toContain('PROPERTY_LATTICE_USERNAME');
  expect(bundle).toContain('function getCSRFToken');
  expect(bundle).toContain('function refreshProfileSlugCacheForUser');
  expect(bundle).toContain('parseProfileSlugsFromProfilesResponse');
  expect(bundle).not.toContain('function authorizeForEncode');
  expect(bundle).not.toContain('function authorizeForIgvf');
  expect(bundle).not.toContain('PROPERTY_ENCODE_USERNAME');
  expect(bundle).not.toContain('PROPERTY_IGVF_USERNAME');
});

// The files are concatenated into one script, so a top-level const that uses a
// const from a file concatenated later fails when the script loads in Apps Script.
test('dist/functions.js loads as one script', () => {
  const bundle = fs.readFileSync(path.join(root, 'dist', 'functions.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  expect(() => vm.runInContext(bundle, sandbox)).not.toThrow();
  expect(typeof sandbox.patchSelectedAppend).toBe('function');
  expect(typeof sandbox.appendToListsInSheet).toBe('function');
});
