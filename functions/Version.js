SCRIPT_VERSION='v0.4.0';
URL_LATEST_RELEASE_LATEST='https://github.com/Lattice-Data/lattice-metadata-submitter/releases/latest';
RELEASE_TAG_PATH_MARKER='/releases/tag/';
URL_PREFIX_UPDATE_HELP='https://github.com/Lattice-Data/lattice-metadata-submitter/blob/';
URL_SUFFIX_UPDATE_HELP='/UPDATE.md';


function getScriptVersion() {
  return SCRIPT_VERSION;
}

/**
 * Resolves the latest release tag by following GitHub's web redirect for
 * /releases/latest (no api.github.com — avoids REST unauthenticated rate limits).
 * @throws {Error} message prefixed with LATTICE_RELEASE_CHECK_ for known failures
 */
function getLatestScriptVersionFromGithub() {
  var response = UrlFetchApp.fetch(URL_LATEST_RELEASE_LATEST, {
    followRedirects: false,
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code !== 301 && code !== 302) {
    throw new Error('LATTICE_RELEASE_CHECK_HTTP_' + code);
  }
  var headers = response.getHeaders();
  var location = headers.Location || headers.location;
  if (!location) {
    throw new Error('LATTICE_RELEASE_CHECK_NO_LOCATION');
  }
  var idx = location.indexOf(RELEASE_TAG_PATH_MARKER);
  if (idx === -1) {
    throw new Error('LATTICE_RELEASE_CHECK_BAD_LOCATION');
  }
  var tail = location.substring(idx + RELEASE_TAG_PATH_MARKER.length);
  var tag = tail.split(/[?#]/)[0];
  tag = decodeURIComponent(tag);
  if (!tag) {
    throw new Error('LATTICE_RELEASE_CHECK_EMPTY_TAG');
  }
  return tag;
}

function getUpdateHelpUrl(version) {
  return URL_PREFIX_UPDATE_HELP + version + URL_SUFFIX_UPDATE_HELP;
}
