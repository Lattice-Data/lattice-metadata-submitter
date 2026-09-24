// Functions ending in "_" are private in Apps Script: a dialog or sidebar can't
// call them through google.script.run. The credential getters and setters are
// private for that reason, and every request below that attaches the stored
// credentials first checks that it is going to an allowed Lattice API endpoint.

const PROPERTY_LATTICE_USERNAME = "latticeUsername";
const PROPERTY_LATTICE_PASSWORD = "latticePassword";

function getUsername_() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_LATTICE_USERNAME);
}

function setUsername_(username) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_LATTICE_USERNAME, username);
}

function getPassword_() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_LATTICE_PASSWORD);
}

function setPassword_(password) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_LATTICE_PASSWORD, password);
}

function makeAuthHeaders(username, password) {
  return {"Authorization" : "Basic " + Utilities.base64Encode(username + ":" + password)};
}

function assertLatticeApiUrl_(url) {
  if (!isLatticeApiUrl(url)) {
    throw new Error(
      "Refusing to send your Lattice credentials to " + url + ". " +
      "Use the menu 'Set endpoint' to pick a Lattice API."
    );
  }
}

/**
 * Fetches CSRF token from `${endpoint}/session` (Lattice / encoded-style APIs).
 * Wire into mutating requests if the target portal requires X-CSRF-Token + cookies.
 */
function getCSRFToken(endpoint, username, password) {
  var url = `${endpoint}/session`;
  var params = {
    "method": "GET",
    "contentType": "application/json",
    "muteHttpExceptions": true
  };
  if (username && password) {
    params["headers"] = makeAuthHeaders(username, password);
  }
  var response = UrlFetchApp.fetch(url, params);
  Logger.log("CSRF Response Code: " + response.getResponseCode());
  Logger.log("CSRF Response: " + response.getContentText());
  if (response.getResponseCode() === 200) {
    var json = JSON.parse(response.getContentText());
    return json["_csrft_"];
  }
  return null;
}

function restGet(url) {
  assertLatticeApiUrl_(url);
  var params = {"method" : "GET", "contentType": "application/json", "muteHttpExceptions": true};
  var username = getUsername_();
  var password = getPassword_();
  if (username && password) {
    params["headers"] = makeAuthHeaders(username, password);
  }
  return UrlFetchApp.fetch(url, params);
}

function getCSRFTokenAndCookies(endpoint, username, password) {
  var url = `${endpoint}/session`;
  var params = {
    "method": "GET",
    "contentType": "application/json",
    "muteHttpExceptions": true
  };
  if (username && password) {
    params["headers"] = makeAuthHeaders(username, password);
  }
  var response = UrlFetchApp.fetch(url, params);
  Logger.log("CSRF Response Code: " + response.getResponseCode());
  Logger.log("CSRF Response: " + response.getContentText());

  if (response.getResponseCode() === 200) {
    var json = JSON.parse(response.getContentText());
    var csrfToken = json["_csrft_"];

    var responseHeaders = response.getAllHeaders();
    var cookies = responseHeaders["Set-Cookie"];
    Logger.log("Cookies: " + JSON.stringify(cookies));

    return {
      csrfToken: csrfToken,
      cookies: cookies
    };
  }
  return null;
}

function restSubmit(url, payloadJson, method) {
  assertLatticeApiUrl_(url);
  var username = getUsername_();
  var password = getPassword_();

  var params = {
    "method": method,
    "contentType": "application/json",
    "muteHttpExceptions": true,
    "payload": JSON.stringify(payloadJson)
  };

  if (username && password) {
    params["headers"] = makeAuthHeaders(username, password);
  }

  return UrlFetchApp.fetch(url, params);
}

/**
 * Concurrently issues a batch of submissions via UrlFetchApp.fetchAll.
 * `requests` is an array of {url, method, payloadJson, headers}. The returned
 * HTTPResponse array preserves the input order so callers can map back
 * to the originating row.
 *
 * Auth (Basic) is added uniformly using the stored credentials. The
 * credentials are read once for the whole batch. Optional per-request
 * `headers` (e.g. If-Match) are added on top.
 *
 * Limits to keep in mind when chunking calls:
 *  - Each individual response is still bounded by ~60 s.
 *  - Total payload size across the batch is capped (Apps Script docs say
 *    50 MB for fetchAll). Callers with attachments should use small chunks
 *    or fall back to per-row restSubmit.
 */
function restSubmitAll(requests) {
  if (!requests || requests.length === 0) {
    return [];
  }
  requests.forEach(function(req) { assertLatticeApiUrl_(req.url); });
  var username = getUsername_();
  var password = getPassword_();
  var authHeaders = (username && password) ? makeAuthHeaders(username, password) : null;

  var fetchParams = requests.map(function(req) {
    var params = {
      "url": req.url,
      "method": req.method,
      "contentType": "application/json",
      "muteHttpExceptions": true,
      "payload": JSON.stringify(req.payloadJson)
    };
    var headers = Object.assign({}, authHeaders, req.headers);
    if (Object.keys(headers).length > 0) {
      params["headers"] = headers;
    }
    return params;
  });

  return UrlFetchApp.fetchAll(fetchParams);
}

/**
 * Concurrently GETs a batch of URLs via UrlFetchApp.fetchAll, with the same
 * Basic auth as restGet. Responses come back in input order.
 */
function restGetAll(urls) {
  if (!urls || urls.length === 0) {
    return [];
  }
  urls.forEach(function(url) { assertLatticeApiUrl_(url); });
  var username = getUsername_();
  var password = getPassword_();
  var authHeaders = (username && password) ? makeAuthHeaders(username, password) : null;

  var fetchParams = urls.map(function(url) {
    var params = {"url": url, "method": "GET", "contentType": "application/json", "muteHttpExceptions": true};
    if (authHeaders) {
      params["headers"] = authHeaders;
    }
    return params;
  });

  return UrlFetchApp.fetchAll(fetchParams);
}

//////////// developer only (for debugging purpose) //////////

const PROPERTY_AWS_ACCESS_KEY = "awsAccessKey";
const PROPERTY_AWS_SECRET_ACCESS_KEY = "awsSecretAccessKey";


function getAwsAccessKey_() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_AWS_ACCESS_KEY);
}

function setAwsAccessKey_(key) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_AWS_ACCESS_KEY, key);
}

function getAwsSecretAccessKey_() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_AWS_SECRET_ACCESS_KEY);
}

function setAwsSecretAccessKey_(key) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_AWS_SECRET_ACCESS_KEY, key);
}
