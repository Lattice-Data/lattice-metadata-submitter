const { loadFunctions, makeFakeUrlFetchApp, credentialGlobals } = require('./support/apps-script-sandbox');

const FILES = ['Library.js', 'Endpoint.js', 'Connection.js'];
const ENDPOINT = 'https://api.sandbox.lattice-data.org';

function setUp() {
  const { UrlFetchApp, requests } = makeFakeUrlFetchApp(() => ({ code: 200, body: {} }));
  const fns = loadFunctions(FILES, { UrlFetchApp, ...credentialGlobals });
  return { fns, requests };
}

test.each([
  ['another host', 'https://evil.example/x'],
  ['a login-style URL whose real host is elsewhere', `${ENDPOINT}@evil.example/x`],
  ['a look-alike host', 'https://api.sandbox.lattice-data.org.evil.example/x'],
  ['plain http', 'http://api.sandbox.lattice-data.org/x'],
])('stored credentials are never sent to %s', (_, url) => {
  const { fns, requests } = setUp();
  expect(() => fns.restGet(url)).toThrow(/Refusing to send your Lattice credentials/);
  expect(() => fns.restGetAll([`${ENDPOINT}/ok/`, url])).toThrow(/Refusing/);
  expect(() => fns.restSubmit(url, {}, 'PATCH')).toThrow(/Refusing/);
  expect(() => fns.restSubmitAll([{ url: `${ENDPOINT}/ok`, method: 'PATCH', payloadJson: {} }, { url }])).toThrow(
    /Refusing/
  );
  expect(requests).toEqual([]);
});

test.each([[`${ENDPOINT}/biosample/u-1/`], ['https://new-stack.demo.lattice-data.org/biosample/u-1/']])(
  'requests to an allowed Lattice API (%s) carry the credentials',
  (url) => {
    const { fns, requests } = setUp();
    fns.restGet(url);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.Authorization).toMatch(/^Basic /);
  }
);

test('the credential getters and setters are private, so dialogs cannot call them', () => {
  const { fns } = setUp();
  ['Username', 'Password', 'AwsAccessKey', 'AwsSecretAccessKey'].forEach((name) => {
    expect(typeof fns[`get${name}`]).toBe('undefined');
    expect(typeof fns[`set${name}`]).toBe('undefined');
    expect(typeof fns[`get${name}_`]).toBe('function');
    expect(typeof fns[`set${name}_`]).toBe('function');
  });
});
