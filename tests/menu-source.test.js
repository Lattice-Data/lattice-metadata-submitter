const fs = require('fs');
const path = require('path');

const menuPath = path.join(__dirname, '..', 'src', 'server', 'menu.js');

test('menu uses Lattice branding and LATTICE auth at top level', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).toMatch(/createMenu\(`Lattice \$\{version\}`\)/);
  expect(menu).toContain("menu.addItem('Authorize for LATTICE', 'authorizeForLattice')");
  expect(menu).not.toContain(
    "menu.addItem('Authorize for IGVF'",
  );
});

test('developer submenu has no ENCODE or IGVF authorization entries', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).not.toContain('Authorize for ENCODE');
  expect(menu).not.toContain('Authorize for IGVF');
  expect(menu).not.toContain('authorizeForEncode');
  expect(menu).not.toContain('authorizeForIgvf');
});

test('Tools menu includes refresh profile list action', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).toContain("submenuTools.addItem('Refresh profile list from portal', 'refreshProfileSlugCacheForUser')");
});
