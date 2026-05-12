/* Lattice API bases; static ALL_LATTICE_PROFILES is fallback when /profiles cannot be fetched.

Live profile slugs: GET {endpoint}/profiles?format=json&frame=object (see ProfileRegistry.js).

Optional host policy: ADDITIONAL_LATTICE_API_ENDPOINT_REGEX (wildcard *only* for extra *.demo.lattice-data.org hosts; the four primary bases are explicit constants below).

curl fallback to inspect slugs manually, e.g.:

curl "https://api.data.lattice-data.org/profiles?format=json&frame=object" \
  | jq | perl -ne '/\/profiles\/(.+).json/ and print "  \"$1\",\n";' | sort | uniq

*/

const ENDPOINT_LATTICE_DEV = "https://lattice-api-dev.demo.lattice-data.org";
const ENDPOINT_LATTICE_SANDBOX = "https://api.sandbox.lattice-data.org";
const ENDPOINT_LATTICE_STAGING = "https://api.staging.lattice-data.org";
const ENDPOINT_LATTICE_DATA = "https://api.data.lattice-data.org";
const LATTICE_ENDPOINTS = [
  ENDPOINT_LATTICE_DEV,
  ENDPOINT_LATTICE_SANDBOX,
  ENDPOINT_LATTICE_STAGING,
  ENDPOINT_LATTICE_DATA,
];

const DEFAULT_ENDPOINT_READ = ENDPOINT_LATTICE_SANDBOX;
const DEFAULT_ENDPOINT_WRITE = ENDPOINT_LATTICE_SANDBOX;

const ALL_ENDPOINTS = [...LATTICE_ENDPOINTS];

// Extra API bases (not in LATTICE_ENDPOINTS): HTTPS only, host must end with .demo.lattice-data.org
// (e.g. new demo stacks). Official sandbox/staging/data URLs stay on the explicit list above — they
// do not need to match this pattern. No query/userinfo; trim trailing slash in SheetData.
const ADDITIONAL_LATTICE_API_ENDPOINT_REGEX =
  /^https:\/\/[a-z0-9.-]+\.demo\.lattice-data\.org\/?$/i;

const ENDPOINT_MAP_API_TO_UI = {
  "https://lattice-api-dev.demo.lattice-data.org": "https://lattice-ui-dev.demo.lattice-data.org",
  "https://api.sandbox.lattice-data.org": "https://sandbox.lattice-data.org",
  "https://api.staging.lattice-data.org": "https://staging.lattice-data.org",
  "https://api.data.lattice-data.org": "https://data.lattice-data.org",
};

const ALL_LATTICE_PROFILES = [
  "access_key",
  "biosample",
  "controlled_term",
  "document",
  "donor",
  "droplet_based_library",
  "experimental_condition",
  "file",
  "file_set",
  "genetic_modification",
  "human_donor",
  "image",
  "cell_line",
  "organoid",
  "lab",
  "library",
  "matrix_file_set",
  "non_human_donor",
  "page",
  "plate_based_library",
  "primary_cell_culture",
  "processed_matrix_file",
  "raw_matrix_file",
  "sequence_file",
  "sequence_file_set",
  "tabular_file",
  "tissue",
  "treatment",
  "user",
];

const LATTICE_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION = [
  "access_key",
  "award",
  "lab",
  "gene",
  "page",
  "source",
  "user",
];

function isAdditionalLatticeApiEndpointByRegex(endpoint) {
  if (!endpoint || typeof endpoint !== "string") {
    return false;
  }
  if (endpoint.indexOf("@") !== -1 || endpoint.indexOf("?") !== -1 || endpoint.indexOf("#") !== -1) {
    return false;
  }
  return ADDITIONAL_LATTICE_API_ENDPOINT_REGEX.test(endpoint);
}

function isValidEndpoint(endpoint) {
  return ALL_ENDPOINTS.includes(endpoint) || isAdditionalLatticeApiEndpointByRegex(endpoint);
}

function getAllProfiles(endpoint) {
  return getResolvedProfileSlugList(endpoint);
}

function getUIEndpoint(endpoint) {
  if (ENDPOINT_MAP_API_TO_UI.hasOwnProperty(endpoint)) {
    return ENDPOINT_MAP_API_TO_UI[endpoint];
  }
  // Regex-allowed *.demo.lattice-data.org API bases not in the map: use API origin for UI links (search, etc.).
  // If API and UI differ for a new host, add an explicit entry to ENDPOINT_MAP_API_TO_UI.
  return endpoint;
}

function usesLatticePortalApi(endpoint) {
  return isValidEndpoint(endpoint);
}

function getLatticeEndpointsAvailableForUsers() {
  return LATTICE_ENDPOINTS;
}

function getAllProfilesForTemplateGeneration(endpoint) {
  var slugs = getAllProfiles(endpoint);
  if (!slugs || !slugs.length) {
    return [];
  }
  return slugs.filter(function (item) {
    return !LATTICE_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION.includes(item);
  });
}
