const { loadFunctions, makeFakeSheet } = require('./support/apps-script-sandbox');

const FILES = [
  'Library.js',
  'Endpoint.js',
  'Sheet.js',
  'Metadata.js',
  'Profile.js',
  'Connection.js',
  'Version.js',
  'UserInterface.js',
];
const HOSTILE = '</pre><img src=x onerror="google.script.run.getPassword()">';

const PROFILE = {
  identifyingProperties: ['uuid', 'aliases'],
  properties: { uuid: { type: 'string' }, description: { type: 'string' } },
};

// Loads the UI code with HtmlService/SpreadsheetApp stand-ins that record every
// dialog's HTML and every alert.
function setUp() {
  const dialogs = [];
  const alerts = [];
  const fns = loadFunctions(FILES, {
    Logger: { log: () => {} },
    HtmlService: {
      createHtmlOutput: (html) => {
        const output = { html, setWidth: () => output, setHeight: () => output };
        return output;
      },
    },
    SpreadsheetApp: {
      getUi: () => ({
        showModalDialog: (output, title) => dialogs.push({ html: output.html, title }),
        alert: (message) => alerts.push(message),
      }),
    },
  });
  const { sheet } = makeFakeSheet([
    ['uuid', 'description'],
    ['u-1', HOSTILE],
  ]);
  sheet.getActiveCell = () => ({ getRow: () => 2 });
  sheet.getName = () => 'Sheet1';
  Object.assign(fns, {
    checkProfile: () => true,
    getCurrentSheet: () => sheet,
    getProfile: () => PROFILE,
    getProfileName: () => 'biosample',
    getEndpoint: () => 'https://api.sandbox.lattice-data.org',
  });
  return { fns, dialogs, alerts };
}

test.each([['convertSelectedRowToJson'], ['exportToJsonText']])('%s shows cell text as text, not HTML', (name) => {
  const { fns, dialogs } = setUp();
  fns[name]();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0].html).not.toContain('<img');
  expect(dialogs[0].html).toContain('&lt;/pre&gt;&lt;img src=x onerror=');
});

test('checkForUpdate escapes the release tag it shows and links to', () => {
  const { fns, dialogs } = setUp();
  fns.getLatestScriptVersionFromGithub = () => 'v9"><img src=x>';
  fns.checkForUpdate();
  expect(dialogs[0].html).not.toContain('<img');
  expect(dialogs[0].html).toContain('New version v9&quot;&gt;&lt;img src=x&gt; is out');
  expect(dialogs[0].html).toContain('blob/v9%22%3E%3Cimg%20src%3Dx%3E/UPDATE.md');
});

test('checkForUpdate reports a GitHub error without needing Utilities.htmlEscape', () => {
  const { fns, dialogs } = setUp();
  fns.getLatestScriptVersionFromGithub = () => {
    throw new Error('LATTICE_RELEASE_CHECK_HTTP_503');
  };
  fns.checkForUpdate();
  expect(dialogs[0].html).toContain('GitHub returned HTTP 503 instead of a redirect.');
});

test('openUrl escapes the link and refuses anything that is not a web link', () => {
  const { fns, dialogs, alerts } = setUp();
  fns.openUrl('https://example.org/a"b<c');
  expect(dialogs[0].html).not.toContain('a"b<c');
  expect(dialogs[0].html).toContain('a.href="https://example.org/a\\"b\\u003cc"');
  expect(dialogs[0].html).toContain('href="https://example.org/a&quot;b&lt;c"');

  // eslint-disable-next-line no-script-url -- checking that such a link is refused
  fns.openUrl('javascript:alert(1)');
  expect(dialogs).toHaveLength(1);
  expect(alerts[0]).toMatch(/^Not a web link/);
});
