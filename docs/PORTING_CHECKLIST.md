# Port checklist: manual GS → repository sources

Reference inputs: [fixtures/manual/functions.gs](../fixtures/manual/functions.gs), [fixtures/manual/code.gs](../fixtures/manual/code.gs). Baseline build before edits: `baseline-pre/` (gitignored).

## Hunk → source file mapping

| Area | Target file |
|------|-------------|
| Lattice / IGVF endpoint constants, `ALL_LATTICE_PROFILES`, `getServerFromUrl`, profile template branches | [functions/Endpoint.js](../functions/Endpoint.js) |
| `PROPERTY_LATTICE_*`, CSRF session helpers, `restSubmit` shape | [functions/Connection.js](../functions/Connection.js) |
| `setDefaultEndpoint` dialog (Lattice + IGVF lists) | [functions/SheetData.js](../functions/SheetData.js) |
| `authorizeForLattice`, `URL_GITHUB`, help strings mentioning LATTICE | [functions/UserInterface.js](../functions/UserInterface.js) |
| Menu title `Lattice`, `Authorize for LATTICE`, no top-level IGVF auth | [src/server/menu.js](../src/server/menu.js) |
| GitHub API/blob URLs, `SCRIPT_VERSION` | [functions/Version.js](../functions/Version.js), README / INSTALL / UPDATE |

## Intentional exclusions

- `ZOPA` debug `alertBox` in `setProfileName` — omitted.
- Byte-identical `code.gs` webpack output — not a goal; [src/server/menu.js](../src/server/menu.js) is the spec.

## `code.gs` → menu spec

From bundled `onOpen`: `createMenu('Lattice')` (we use `` `Lattice ${version}` ``), `authorizeForLattice`, primary auth label `Authorize for LATTICE`.

## IGVF profile list

Manual list plus `pseudobulk_set` retained from pre-port repo for compatibility.
