### Code structure

There are 3 places for source code.

- `functions/*.js`: Most of source code resides here. All `.js` files will be merged to a single file `dist/functions.gs`.
- `src/html/*.html`: Place for all HTMLs (dialog box, sidebar). All HTMLs will be copied to `dist/`.
- `src/server/menu.js`: This file and all node packages will be merged to `dist/code.gs`.
- `src/server/ANY_NODE_PACKAGE_NAME.js`: Interface for Node package. See the below section for details.
- `appsscript.json`: Google Permission stuffs. If you add a new feature that requires more Google Permission, then add it to this file.


## How to deploy it to remote Apps Script

Running `npm run deploy` will make a new build on `dist/` and deploy it to the App Script defined in `.clasp.json`.


### How to add a new Node package

Google Apps Script has its own libraries but they are not very good. For example, they didn't have a good JSON schema validator so I added `ajv` to the project.

Add a package of interest to `package.json` and make a new `ANY_GOOD_NAME.js` file on `src/server/` and add a global function to call functions from the package. Apps Script files in `functions/` will only have access to those global functions (not the package itself).

Take a look at `src/server/jsonSchema.js` and see how `validateJson()` is called in Apps Script files in `functions/`.


### CLI utilities (related ecosystem)

The broader IGVF project ships command-line helpers such as [igvf_utils](https://github.com/IGVF-DACC/igvf_utils) (forked from `encode_utils`). This spreadsheet submitter is maintained for **Lattice** only; use Lattice portal docs for API credentials and profile URLs.


### Apps Script Quota and profile type names

Apps Script URL fetch quotas apply. Profile type slugs are resolved by calling `GET {endpoint}/profiles?format=json&frame=object`, cached in [`functions/ProfileRegistry.js`](functions/ProfileRegistry.js) (`CacheService`, TTL up to six hours), with fallback to `ALL_LATTICE_PROFILES` in [`functions/Endpoint.js`](functions/Endpoint.js) when the portal is unreachable. Refresh manually via **Tools → Refresh profile list from portal** after releases. The four primary API URLs are fixed in `LATTICE_ENDPOINTS` in `Endpoint.js` (sandbox/staging/data do not need `.demo` in the hostname). Separately, `ADDITIONAL_LATTICE_API_ENDPOINT_REGEX` allows **extra** HTTPS hosts that end with `.demo.lattice-data.org` only.


### How to debug in Apps Script

Go to the spreadsheet and click on `Extensions` - `Apps Script`. Most menu items are linked to functions in `functions/UserInterface.gs` and they are free of arguments. So select any function to debug and click on Debug button.

If you want to debug running the script from google sheet menu item, you can use [Apps Script execution log](https://developers.google.com/apps-script/guides/logging#use_the_apps_script_execution_log).


### How script update (upgrade) works

If a user clicks on `Check for script update` menu then the code wil check the latest release on github and check if its tag matches with `SCRIPT_VERSION`. See `Version.js` for details.


### How to bump version and make a new sheet

See [`INSTALL.md`](INSTALL.md) for details about how to create a new Google Sheet document.

And then update the followings:
- var `SCRIPT_VERSION` in `functions/Version.js`.
- Google Sheet URL and version number in `README.md`.
- Version number in `INSTALL.md`.


### How to update Lattice profiles to the latest

For quota-related reasons, valid profile names are hardcoded in `functions/Endpoint.js`. See the comment at the top of that file for a shell one-liner that lists profile slugs from a running Lattice API (for example production data). Replace the contents of `ALL_LATTICE_PROFILES` with the sorted result.


### Make changes to the local code and apply it to remote Sheet

Simply run the following to update remote Sheet with the local code.
```
$ npm run deploy
```

Make sure that target Apps Script ID matches with that defined in `.clasp.json`.

### Automated tests

Run `npm test` before opening a PR. This runs Jest checks on `src/server/menu.js` and on the webpack output `dist/functions.js` (the suite runs `npm run build` first). Optional byte-level compare of the merged functions bundle against `fixtures/manual/functions.gs`: `FULL_PARITY=1 npm run test:parity` (usually fails unless file order matches the manual snapshot).

On GitHub, every **push** and **pull request** runs the same install, build, and test steps via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

