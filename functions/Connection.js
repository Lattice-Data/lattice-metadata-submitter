const PROPERTY_ENCODE_USERNAME = "encodeUsername";
const PROPERTY_ENCODE_PASSWORD = "encodePassword";
const PROPERTY_IGVF_USERNAME = "igvfUsername";
const PROPERTY_IGVF_PASSWORD = "igvfPassword";
const PROPERTY_LATTICE_USERNAME = "latticeUsername";
const PROPERTY_LATTICE_PASSWORD = "latticePassword";


function getUsername(server) {
  var userProperties = PropertiesService.getUserProperties();
  switch(server) {
    case ENCODE:
      return userProperties.getProperty(PROPERTY_ENCODE_USERNAME);
    case IGVF:
      return userProperties.getProperty(PROPERTY_IGVF_USERNAME);
    case LATTICE:
      return userProperties.getProperty(PROPERTY_LATTICE_USERNAME);
  }
}

function setUsername(username, server) {
  var userProperties = PropertiesService.getUserProperties();
  switch(server) {
    case ENCODE:
      return userProperties.setProperty(PROPERTY_ENCODE_USERNAME, username);
    case IGVF:
      return userProperties.setProperty(PROPERTY_IGVF_USERNAME, username);
    case LATTICE:
      return userProperties.setProperty(PROPERTY_LATTICE_USERNAME, username);
  }
}

function getPassword(server) {
  var userProperties = PropertiesService.getUserProperties();
  switch(server) {
    case ENCODE:
      return userProperties.getProperty(PROPERTY_ENCODE_PASSWORD);
    case IGVF:
      return userProperties.getProperty(PROPERTY_IGVF_PASSWORD);
    case LATTICE:
      return userProperties.getProperty(PROPERTY_LATTICE_PASSWORD);
  }
}

function setPassword(password, server) {
  var userProperties = PropertiesService.getUserProperties();
  switch(server) {
    case ENCODE:
      return userProperties.setProperty(PROPERTY_ENCODE_PASSWORD, password);
    case IGVF:
      return userProperties.setProperty(PROPERTY_IGVF_PASSWORD, password);
    case LATTICE:
      return userProperties.setProperty(PROPERTY_LATTICE_PASSWORD, password);
  }
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
  var server = getServerFromUrl(url);
  var username = getUsername(server);
  var password = getPassword(server);
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
  var server = getServerFromUrl(url);
  var username = getUsername(server);
  var password = getPassword(server);

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
