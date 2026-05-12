# Port checklist: manual GS → repository sources

Reference inputs: [fixtures/manual/functions.gs](../fixtures/manual/functions.gs), [fixtures/manual/code.gs](../fixtures/manual/code.gs). Baseline build before edits: `baseline-pre/` (gitignored).

## Hunk → source file mapping

| Area | Target file |
|------|-------------|
| Lattice endpoint constants, regex policy, `ENDPOINT_MAP_API_TO_UI`, static `ALL_LATTICE_PROFILES` fallback | [functions/Endpoint.js](../functions/Endpoint.js) |
| Profile slug fetch + cache, `refreshProfileSlugCacheForUser` | [functions/ProfileRegistry.js](../functions/ProfileRegistry.js), [functions/ProfileSlugParse.js](../functions/ProfileSlugParse.js) |
| `PROPERTY_LATTICE_*`, CSRF session helpers, `restSubmit` / `restGet` | [functions/Connection.js](../functions/Connection.js) |
| `setDefaultEndpoint` dialog (supported Lattice API list) | [functions/SheetData.js](../functions/SheetData.js) |
| `authorizeForLattice`, `URL_GITHUB`, help strings mentioning LATTICE | [functions/UserInterface.js](../functions/UserInterface.js) |
| Menu title `Lattice`, `Authorize for LATTICE`, developer submenu (no legacy portal auth) | [src/server/menu.js](../src/server/menu.js) |
| GitHub API/blob URLs, `SCRIPT_VERSION` | [functions/Version.js](../functions/Version.js), README / INSTALL / UPDATE |

## Intentional exclusions

- `ZOPA` debug `alertBox` in `setProfileName` — omitted.
- Byte-identical `code.gs` webpack output — not a goal; [src/server/menu.js](../src/server/menu.js) is the spec.

## `code.gs` → menu spec

From bundled `onOpen`: `createMenu('Lattice')` (we use `` `Lattice ${version}` ``), `authorizeForLattice`, primary auth label `Authorize for LATTICE`.

## Lattice profile list

Prefer live `/profiles` + cache ([functions/ProfileRegistry.js](../functions/ProfileRegistry.js)); keep `ALL_LATTICE_PROFILES` in [functions/Endpoint.js](../functions/Endpoint.js) as fallback and for offline documentation (curl recipe in file header).
