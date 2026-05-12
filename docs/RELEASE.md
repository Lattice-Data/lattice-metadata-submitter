# How to relase a new version

1. Create a branch for the new release.
2. Update `SCRIPT_VERSION` in `functions/Version.js`.
3. Update the Lattice profile list in `functions/Endpoint.js` (`ALL_LATTICE_PROFILES`) if the portal added or renamed profiles.
4. Update `INSTALL.md` with the new title, for example **Lattice Metadata Submitter v0.3.1**, for creating the new Google Sheet. Follow the instructions in the document to create the new Google Spreadsheet. Get the script ID from the output and edit `scriptId` in `.clasp.json`.
5. Update README.md with the new version number and new file link you just generated.
6. Update UPDATE.md with the new links for `functions.gs` and `code.gs`.
7. Create a pull request for it. Once it is approved then you can merge it to MAIN branch and create your new release.
