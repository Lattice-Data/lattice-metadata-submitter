/**
 * Must stay aligned with ADDITIONAL_LATTICE_API_ENDPOINT_REGEX in functions/Endpoint.js.
 * That pattern only applies to *extra* hosts not in LATTICE_ENDPOINTS; the four primary bases
 * (sandbox/staging/data) are valid via explicit whitelist without matching this regex.
 */
const ADDITIONAL_LATTICE_API_ENDPOINT_REGEX =
  /^https:\/\/[a-z0-9.-]+\.demo\.lattice-data\.org\/?$/i;

test('additional Lattice API regex accepts *.demo.lattice-data.org hosts', () => {
  expect(
    ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://lattice-api-dev.demo.lattice-data.org'),
  ).toBe(true);
  expect(
    ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://future-api.demo.lattice-data.org'),
  ).toBe(true);
  expect(
    ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://lattice-api-dev.demo.lattice-data.org/'),
  ).toBe(true);
});

test('additional Lattice API regex rejects non-demo Lattice hosts and unsafe URLs', () => {
  expect(ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://api.sandbox.lattice-data.org')).toBe(
    false,
  );
  expect(ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('http://lattice-api-dev.demo.lattice-data.org')).toBe(
    false,
  );
  expect(
    ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://lattice-api-dev.demo.lattice-data.org/path'),
  ).toBe(false);
  expect(
    ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://user@lattice-api-dev.demo.lattice-data.org'),
  ).toBe(false);
  expect(ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://evil.com')).toBe(false);
  expect(ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test('https://api.data.lattice-data.org')).toBe(false);
});
