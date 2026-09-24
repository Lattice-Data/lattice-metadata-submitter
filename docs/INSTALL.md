# Installing from code

Enable [Google Apps Script API](https://script.google.com/home/usersettings).

Update `Node.js` and `npm`

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo npm install npm -g
```

Install the project's dependencies, which include `clasp` (run it with `npx clasp`), and log in to Google.

```bash
npm ci
npx clasp login
```

Create with a new Google Spreadsheet with the script.

```bash
npx clasp create --type sheets --title "Lattice Metadata Submitter v0.6.0" --rootDir ./dist
```

Get the new Google Sheets Add-on script ID from the console output and edit `scriptId` in `.clasp.json`.

Deploy the script to the created sheet. Whenver you make changes to the code, run this to update the code in Google Apps Script.

```bash
npm run deploy
```
