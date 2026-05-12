const PROFILE_SLUG_CACHE_PREFIX = "profileSlugs:v1:";
const PROFILE_SLUG_CACHE_TTL_SEC = 21600;

function profileSlugCacheKey(endpoint) {
  var base = PROFILE_SLUG_CACHE_PREFIX + endpoint;
  if (base.length > 240) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      endpoint,
      Utilities.Charset.UTF_8
    );
    return PROFILE_SLUG_CACHE_PREFIX + Utilities.base64Encode(digest).substring(0, 200);
  }
  return base;
}

function getCachedProfileSlugList(endpoint) {
  var raw = CacheService.getScriptCache().get(profileSlugCacheKey(endpoint));
  if (!raw) {
    return null;
  }
  try {
    var arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      return arr;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function setCachedProfileSlugList(endpoint, list) {
  CacheService.getScriptCache().put(
    profileSlugCacheKey(endpoint),
    JSON.stringify(list),
    PROFILE_SLUG_CACHE_TTL_SEC
  );
}

function clearCachedProfileSlugList(endpoint) {
  CacheService.getScriptCache().remove(profileSlugCacheKey(endpoint));
}

function fetchProfileSlugListFromPortal(endpoint) {
  var url = `${endpoint}/profiles?format=json&frame=object`;
  var response = restGet(url);
  if (response.getResponseCode() !== 200) {
    return [];
  }
  return parseProfileSlugsFromProfilesResponse(response.getContentText());
}

/**
 * Returns profile slugs for an allowed endpoint: cache hit, else live /profiles fetch,
 * else static ALL_LATTICE_PROFILES from Endpoint.js.
 */
function getResolvedProfileSlugList(endpoint) {
  if (!isValidEndpoint(endpoint)) {
    return null;
  }
  var cached = getCachedProfileSlugList(endpoint);
  if (cached) {
    return cached;
  }
  var fetched = fetchProfileSlugListFromPortal(endpoint);
  if (fetched && fetched.length) {
    setCachedProfileSlugList(endpoint, fetched);
    return fetched;
  }
  return ALL_LATTICE_PROFILES.slice();
}

function refreshProfileSlugCacheForUser() {
  var endpoint = getEndpoint();
  if (!endpoint) {
    alertBox("No default endpoint set. Use Set endpoint first.");
    return;
  }
  if (!isValidEndpoint(endpoint)) {
    alertBox("Current endpoint is not allowed: " + endpoint);
    return;
  }
  clearCachedProfileSlugList(endpoint);
  var fresh = fetchProfileSlugListFromPortal(endpoint);
  if (!fresh || !fresh.length) {
    alertBox(
      "Could not load profile list from portal (using static list until GET /profiles succeeds). " +
        "Check endpoint URL and credentials."
    );
    return;
  }
  setCachedProfileSlugList(endpoint, fresh);
  alertBox("Cached " + fresh.length + " profile types from " + endpoint + ".");
}
