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

test('IGVF authorization remains under developer submenu', () => {
  const menu = fs.readFileSync(menuPath, 'utf8');
  expect(menu).toContain("submenuDeveloper.addItem('Authorize for IGVF', 'authorizeForIgvf')");
});
