const PROPERTY_LATTICE_USERNAME = "latticeUsername";
const PROPERTY_LATTICE_PASSWORD = "latticePassword";

function getUsername() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_LATTICE_USERNAME);
}

function setUsername(username) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_LATTICE_USERNAME, username);
}

function getPassword() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_LATTICE_PASSWORD);
}

function setPassword(password) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_LATTICE_PASSWORD, password);
}

function makeAuthHeaders(username, password) {
  return {"Authorization" : "Basic " + Utilities.base64Encode(username + ":" + password)};
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
  var params = {"method" : "GET", "contentType": "application/json", "muteHttpExceptions": true};
  var username = getUsername();
  var password = getPassword();
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
  var username = getUsername();
  var password = getPassword();

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
 * `requests` is an array of {url, method, payloadJson}. The returned
 * HTTPResponse array preserves the input order so callers can map back
 * to the originating row.
 *
 * Auth (Basic) is added uniformly using the stored credentials. The
 * credentials are read once for the whole batch.
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
  var username = getUsername();
  var password = getPassword();
  var authHeaders = (username && password) ? makeAuthHeaders(username, password) : null;

  var fetchParams = requests.map(function(req) {
    var params = {
      "url": req.url,
      "method": req.method,
      "contentType": "application/json",
      "muteHttpExceptions": true,
      "payload": JSON.stringify(req.payloadJson)
    };
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


function getAwsAccessKey() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_AWS_ACCESS_KEY);
}

function setAwsAccessKey(key) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_AWS_ACCESS_KEY, key);
}

function getAwsSecretAccessKey() {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty(PROPERTY_AWS_SECRET_ACCESS_KEY);
}

function setAwsSecretAccessKey(key) {
  var userProperties = PropertiesService.getUserProperties();
  return userProperties.setProperty(PROPERTY_AWS_SECRET_ACCESS_KEY, key);
}
