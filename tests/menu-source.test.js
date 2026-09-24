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

test('menu offers a PATCH that appends to lists, next to the one that replaces them', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).toContain(
    "menu.addItem('PATCH selected columns', 'patchSelected');\n" +
      "  menu.addItem('PATCH selected columns (append to lists)', 'patchSelectedAppend');"
  );
});

test('Tools menu includes refresh profile list action', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).toContain("submenuTools.addItem('Refresh profile list from portal', 'refreshProfileSlugCacheForUser')");
});
