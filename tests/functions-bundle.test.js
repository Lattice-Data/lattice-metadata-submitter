const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
