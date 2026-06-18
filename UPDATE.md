# Update

This documents describes how to replace submitter's script with the latest version without losing contents of the original Spreadsheet.

Please make a copy of original spreadsheet first and run the following on the copied spreadsheet.

1) Click on the menu `Extensions` - `Apps Script`.

2) Click on `functions.gs` and replace contents with `functions.gs` from the latest release: <https://github.com/Lattice-Data/lattice-metadata-submitter/releases/latest>.

3) Click on `code.gs` and replace contents with `code.gs` from the latest release: <https://github.com/Lattice-Data/lattice-metadata-submitter/releases/latest>.

4) **Replace `appsscript.json` if the release includes one.** Click the gear icon (`Project Settings`) in the left sidebar of the Apps Script editor, enable **"Show 'appsscript.json' manifest file in editor"**, return to the `Editor`, click `appsscript.json`, and replace its contents with `appsscript.json` from the same release. Skip this step only if the release notes say the manifest did not change.

5) Refresh the spreadsheet and check the version number in the `Lattice` menu.

6) When you next run a menu action (e.g. POST), Google may show a re-authorization prompt because the manifest changed. Accept it; the new scopes are listed in the release notes.

7) Additionally run `Lattice` - `Check for script update` to make sure that the script is up to date.
