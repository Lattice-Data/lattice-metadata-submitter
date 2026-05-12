const PROPERTY_ENCODE_USERNAME = "encodeUsername";
const PROPERTY_ENCODE_PASSWORD = "encodePassword";
const PROPERTY_IGVF_USERNAME = "igvfUsername";
const PROPERTY_IGVF_PASSWORD= "igvfPassword";
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
    return json["_csrft_"];  // <-- CHANGED THIS
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
    
    // Get session cookie from response headers
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

/* All endpoint-specific data


ALL_ENCODE_PROFILES from the following command line (snapshotted at 05/23/2022)

curl "https://www.encodeproject.org/profiles/?format=json&frame=object" \
  | jq | perl -ne '/\/profiles\/(.+).json/ and print "  \"$1\",\n";' | sort | uniq


ALL_IGVF_PROFILES from "ORDER" array in the following file (snapshotted at 09/27/2023)
It's an ordered list of profiles:
  https://github.com/IGVF-DACC/igvfd/blob/dev/src/igvfd/loadxl.py#L15

Double-check it with profiles retrieved with the following command line

curl "https://api.data.igvf.org/profiles?format=json&frame=object" \
  | jq | perl -ne '/\/profiles\/(.+).json/ and print "  \"$1\",\n";' | sort | uniq

*/

const ENCODE = "ENCODE";
const IGVF = "IGVF";
const LATTICE = "LATTICE";

// These are API endpoints.
// If there is a UI endpoint then add it to ENDPOINT_MAP_API_TO_UI below
// Otherwise, the script will use the same endpoint for API and UI

const ENDPOINT_ENCODE_PROD = "https://www.encodeproject.org";
const ENDPOINT_ENCODE_TEST = "https://test.encodedcc.org";
const ENCODE_ENDPOINTS = [
  ENDPOINT_ENCODE_PROD,
  ENDPOINT_ENCODE_TEST,
];

const ENDPOINT_IGVF_TEST = "https://igvfd-dev.demo.igvf.org";
const ENDPOINT_IGVF_SANDBOX = "https://api.sandbox.igvf.org";
const ENDPOINT_IGVF_STAGING = "https://api.staging.igvf.org";
const ENDPOINT_IGVF_DATA = "https://api.data.igvf.org";
const IGVF_ENDPOINTS = [
  ENDPOINT_IGVF_TEST,
  ENDPOINT_IGVF_SANDBOX,
  ENDPOINT_IGVF_STAGING,
  ENDPOINT_IGVF_DATA,
];

const ENDPOINT_LATTICE_DEV = "https://lattice-api-dev.demo.lattice-data.org";
const ENDPOINT_LATTICE_SANDBOX = "https://api.sandbox.lattice-data.org";
const ENDPOINT_LATTICE_STAGING = "https://api.staging.lattice-data.org";
const ENDPOINT_LATTICE_DATA = "https://api.data.lattice-data.org";
const ENDPOINT_LATTICE_DEMO = "https://lattice-api-dev.demo.lattice-data.org/";
const LATTICE_ENDPOINTS = [
  ENDPOINT_LATTICE_DEV,
  ENDPOINT_LATTICE_SANDBOX,
  ENDPOINT_LATTICE_STAGING,
  ENDPOINT_LATTICE_DATA,
  ENDPOINT_LATTICE_DEMO,
];

const DEFAULT_ENDPOINT_READ = ENDPOINT_IGVF_SANDBOX;
const DEFAULT_ENDPOINT_WRITE = ENDPOINT_IGVF_SANDBOX;

const ALL_ENDPOINTS = [
  ...ENCODE_ENDPOINTS,
  ...IGVF_ENDPOINTS,
  ...LATTICE_ENDPOINTS,
];

// Mapping from API to UI
// Define only if API and UI endpoints are different
const ENDPOINT_MAP_API_TO_UI = {
  "https://igvfd-dev.demo.igvf.org": "https://igvf-ui-dev.demo.igvf.org",
  "https://api.sandbox.igvf.org" : "https://sandbox.igvf.org",
  "https://api.staging.igvf.org" : "https://staging.igvf.org",
  "https://api.data.igvf.org" : "https://data.igvf.org",
  "https://lattice-api-dev.demo.lattice-data.org": "https://lattice-ui-dev.demo.lattice-data.org",
  "https://api.sandbox.lattice-data.org": "https://sandbox.lattice-data.org",
  "https://api.staging.lattice-data.org": "https://staging.lattice-data.org",
  "https://api.data.lattice-data.org": "https://data.lattice-data.org",
};

const ALL_ENCODE_PROFILES = [
  "access_key_admin",
  "aggregate_series",
  "analysis",
  "analysis_step",
  "analysis_step_run",
  "analysis_step_version",
  "annotation",
  "antibody_characterization",
  "antibody_lot",
  "atac_alignment_enrichment_quality_metric",
  "atac_alignment_quality_metric",
  "atac_library_complexity_quality_metric",
  "atac_peak_enrichment_quality_metric",
  "atac_replication_quality_metric",
  "award",
  "biosample",
  "biosample_characterization",
  "biosample_type",
  "bismark_quality_metric",
  "bpnet_quality_metric",
  "bru_library_quality_metric",
  "cart",
  "chia_pet_alignment_quality_metric",
  "chia_pet_chr_interactions_quality_metric",
  "chia_pet_peak_enrichment_quality_metric",
  "chip_alignment_enrichment_quality_metric",
  "chip_alignment_samstat_quality_metric",
  "chip_library_quality_metric",
  "chip_peak_enrichment_quality_metric",
  "chip_replication_quality_metric",
  "chipseq_filter_quality_metric",
  "collection_series",
  "complexity_xcorr_quality_metric",
  "computational_model",
  "correlation_quality_metric",
  "cpg_correlation_quality_metric",
  "differential_accessibility_series",
  "differentiation_series",
  "disease_series",
  "dnase_alignment_quality_metric",
  "dnase_footprinting_quality_metric",
  "document",
  "donor_characterization",
  "duplicates_quality_metric",
  "edwbamstats_quality_metric",
  "experiment",
  "experiment_series",
  "file",
  "filtering_quality_metric",
  "fly_donor",
  "functional_characterization_experiment",
  "functional_characterization_series",
  "gembs_alignment_quality_metric",
  "gencode_category_quality_metric",
  "gene",
  "gene_quantification_quality_metric",
  "generic_quality_metric",
  "gene_silencing_series",
  "genetic_modification",
  "genetic_modification_characterization",
  "gene_type_quantification_quality_metric",
  "hic_quality_metric",
  "histone_chipseq_quality_metric",
  "hotspot_quality_metric",
  "human_donor",
  "idr_quality_metric",
  "idr_summary_quality_metric",
  "image",
  "lab",
  "library",
  "long_read_rna_mapping_quality_metric",
  "long_read_rna_quantification_quality_metric",
  "mad_quality_metric",
  "manatee_donor",
  "matched_set",
  "micro_rna_mapping_quality_metric",
  "micro_rna_quantification_quality_metric",
  "mouse_donor",
  "multiomics_series",
  "organism",
  "organism_development_series",
  "page",
  "pipeline",
  "platform",
  "project",
  "publication",
  "publication_data",
  "pulse_chase_time_series",
  "quality_standard",
  "reference",
  "reference_epigenome",
  "replicate",
  "replication_timing_series",
  "rna_expression",
  "samtools_flagstats_quality_metric",
  "samtools_stats_quality_metric",
  "sc_atac_alignment_quality_metric",
  "sc_atac_analysis_quality_metric",
  "sc_atac_counts_summary_quality_metric",
  "sc_atac_library_complexity_quality_metric",
  "sc_atac_multiplet_quality_metric",
  "sc_atac_read_quality_metric",
  "scrna_seq_counts_summary_quality_metric",
  "segway_quality_metric",
  "single_cell_rna_series",
  "single_cell_unit",
  "software",
  "software_version",
  "source",
  "star_quality_metric",
  "star_solo_quality_metric",
  "target",
  "transgenic_enhancer_experiment",
  "treatment",
  "treatment_concentration_series",
  "treatment_time_series",
  "trimming_quality_metric",
  "ucsc_browser_composite",
  "user",
  "worm_donor",
];
const CORE_SET_ENCODE_PROFILES = [
  "experiment",
];

const ALL_IGVF_PROFILES = [
  "access_key",
  "alignment_file",
  "analysis_set",
  "analysis_step",
  "analysis_step_version",
  "assay_term",
  "auxiliary_set",
  "award",
  "biomarker",
  "configuration_file",
  "construct_library_set",
  "crispr_modification",
  "curated_set",
  "degron_modification",
  "document",
  "gene",
  "genome_browser_annotation_file",
  "human_donor",
  "image",
  "image_file",
  "in_vitro_system",
  "index_file",
  "institutional_certificate",
  "lab",
  "matrix_file",
  "measurement_set",
  "model_file",
  "model_set",
  "mpra_quality_metric",
  "multiplexed_sample",
  "open_reading_frame",
  "page",
  "perturb_seq_quality_metric",
  "phenotype_term",
  "phenotypic_feature",
  "platform_term",
  "prediction_set",
  "primary_cell",
  "publication",
  "reference_file",
  "rodent_donor",
  "sample_term",
  "sequence_file",
  "signal_file",
  "single_cell_atac_seq_quality_metric",
  "single_cell_rna_seq_quality_metric",
  "software",
  "software_version",
  "source",
  "starr_seq_quality_metric",
  "tabular_file",
  "technical_sample",
  "tissue",
  "treatment",
  "user",
  "whole_organism",
  "workflow",
];

const IGVF_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION = [
  "access_key",
  "award",
  "lab",
  "gene",
  "assay_term",
  "phenotype_term",
  "platform_term",
  "sample_term",
  "page",
  "source",
  "user",
  "human_genomic_variant",
  "construct_library",
  "prediction",
  "model",
];

const CORE_SET_IGVF_PROFILES = [
  "document",
  "measurement_set",
  "sequence_file",
];

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

const CORE_SET_LATTICE_PROFILES = [
  "document",
];

function isEncodeEndpoint(endpoint) {
  return ENCODE_ENDPOINTS.includes(endpoint);
}

function isIgvfEndpoint(endpoint) {
  return IGVF_ENDPOINTS.includes(endpoint);
}

function isLatticeEndpoint(endpoint) {
  return LATTICE_ENDPOINTS.includes(endpoint);
}

function isValidEndpoint(endpoint) {
  return ALL_ENDPOINTS.includes(endpoint);
}

function isEncodeUrl(url) {
  return ENCODE_ENDPOINTS.some(endpoint => {
    if(url.startsWith(endpoint)) {
      return true;
    }
  });
}

function isIgvfUrl(url) {
  return IGVF_ENDPOINTS.some(endpoint => {
    if(url.startsWith(endpoint)) {
      return true;
    }
  });
}

function isLatticeUrl(url) {
  return LATTICE_ENDPOINTS.some(endpoint => {
    if(url.startsWith(endpoint)) {
      return true;
    }
  });
}

function getServerFromUrl(url) {
  if (isEncodeUrl(url)) {
    return ENCODE;
  } else if (isIgvfUrl(url)) {
    return IGVF;
  } else if (isLatticeUrl(url)) {
    return LATTICE;
  }
}

function getAllProfiles(endpoint) {
  if (isEncodeEndpoint(endpoint)) {
    return ALL_ENCODE_PROFILES;
  } else if (isIgvfEndpoint(endpoint)) {
    return ALL_IGVF_PROFILES;
  } else if (isLatticeEndpoint(endpoint)) {
    return ALL_LATTICE_PROFILES;
  }
}

function getUIEndpoint(endpoint) {
  if (ENDPOINT_MAP_API_TO_UI.hasOwnProperty(endpoint)) {
    return ENDPOINT_MAP_API_TO_UI[endpoint];
  }
  return endpoint;
}

function getIgvfEndpointsAvailableForUsers() {
  // hide ENDPOINT_IGVF_TEST from users
  return IGVF_ENDPOINTS.filter(e => e !== ENDPOINT_IGVF_TEST);
}

function getLatticeEndpointsAvailableForUsers() {
  // hide ENDPOINT_LATTICE_DEV from users
  return LATTICE_ENDPOINTS.filter(e => e !== ENDPOINT_LATTICE_DEV);
}

function getAllProfilesForTemplateGeneration(endpoint) {
  if (isEncodeEndpoint(endpoint)) {
    return ALL_ENCODE_PROFILES;
  } else if (isIgvfEndpoint(endpoint)) {
    return ALL_IGVF_PROFILES
      .filter(item => !IGVF_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION.includes(item));
  } else if (isLatticeEndpoint(endpoint)) {
    return ALL_LATTICE_PROFILES
      .filter(item => !LATTICE_PROFILES_EXCLUSION_LIST_FOR_TEMPLATE_GENERATION.includes(item));
  }
}

function getDriveFileFromPath(path) {
  var basename = getBasename(path);
  var dirname = getDirname(path);

  var folder = getDriveFolderFromPath(dirname);
  var files = folder.getFilesByName(basename);
  if (files.hasNext()) {
    return files.next();
  }
}

// code from: https://ramblings.mcpher.com/gassnippets2/finding-a-drive-app-folder-by-path/
function getDriveFolderFromPath(path) {
  return (path || "/").split(/[\\/]/).reduce( function(prev,current) {
    if (prev && current) {
      var fldrs = prev.getFoldersByName(current);
      return fldrs.hasNext() ? fldrs.next() : null;
    }
    else {
      return current ? null : prev;
    }
  },DriveApp.getRootFolder());
}

function getType(p) {
    if (Array.isArray(p)) return "array";
    else if (typeof p == "string") return "string";
    else if (typeof p == "number") return "number";
    else if (p != null && typeof p == "object") return "object";
    else return "other";
}

function last(array) {
  return array[array.length - 1];
}

function toBoolean(val) {
  var s = String(val).toLowerCase();
  return ["1", "true", "t", "o"].includes(s);
}

function isArrayString(str) {
  var trimmed = str.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

function isJsonString(str) {
  var trimmed = str.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function trimTrailingDot(str) {
  return str.replace(/\.$/, "");
}

function trimTrailingSlash(str) {
  return str.replace(/\/+$/, "");
}

function snakeToCamel(snake) {
  return snake.toLowerCase().replace(/([-_][a-z])/g,
    group => group.toUpperCase().replace('-', '').replace('_', '')
  );
}

function camelToSnake(camel) {
  return camel.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function capitalizeWord(word) {
  return word[0].toUpperCase() + word.substr(1);
}

function uncapitalizeWord(word) {
  return word[0].toLowerCase() + word.substr(1);
}

function alertBoxOkCancel(prompt) {
  return SpreadsheetApp.getUi().alert(
    prompt, SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
  ) === SpreadsheetApp.getUi().Button.OK;
}

function alertBox(prompt) {
  SpreadsheetApp.getUi().alert(prompt);
}

function getCurrentLocalTimeString(sep="-") {
  // returns current time string with all special characters
  // replaced with `sep`
  var d = new Date();
  d = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  if (sep != "") {
    return d.toISOString().replace(/T/g,sep).replace(/\:/g,sep).replace(/Z/g,'') .replace(/\..*/g,'');
  }
  return d.toISOString().replace(/T/g,' ').replace(/Z/g,'');
}

// https://stackoverflow.com/a/47098533/8819536
function openUrl( url ){
  var html = HtmlService.createHtmlOutput('<html><script>'
  +'window.close = function(){window.setTimeout(function(){google.script.host.close()},9)};'
  +'var a = document.createElement("a"); a.href="'+url+'"; a.target="_blank";'
  +'if(document.createEvent){'
  +'  var event=document.createEvent("MouseEvents");'
  +'  if(navigator.userAgent.toLowerCase().indexOf("firefox")>-1){window.document.body.append(a)}'                          
  +'  event.initEvent("click",true,true); a.dispatchEvent(event);'
  +'}else{ a.click() }'
  +'close();'
  +'</script>'
  // Offer URL as clickable link in case above code fails.
  +'<body style="word-break:break-word;font-family:sans-serif;">Failed to open automatically. <a href="'+url+'" target="_blank" onclick="window.close()">Click here to proceed</a>.</body>'
  +'<script>google.script.host.setHeight(40);google.script.host.setWidth(410)</script>'
  +'</html>')
  .setWidth( 90 ).setHeight( 1 );
  SpreadsheetApp.getUi().showModalDialog( html, "Opening ..." );
}

function getBasename(path) {
  return path.split(/[\\/]/).pop();
}

function getDirname(path) {
  var array = path.split(/[\\/]/);
  array.pop();
  return array.join("/");
}

const HELP_TEXT_INDENT = 2;
const EXPORTED_JSON_INDENT = 2;
const HEADER_COMMENTED_PROP_SKIP = "#skip";
const HEADER_COMMENTED_PROP_RESPONSE = "#response";
const HEADER_COMMENTED_PROP_RESPONSE_TIME = "#response_time";
const HEADER_COMMENTED_PROP_UPLOAD_ABSPATH = "#upload_abspath";
const HEADER_COMMENTED_PROP_UPLOAD_STATUS = "#upload_status";
const HEADER_COMMENTED_PROP_UPLOAD_CMD = "#upload_cmd";
const DEFAULT_EXPORTED_JSON_FILE_PREFIX = "encode-metadata-submitter.exported";
const TOOLTIP_FOR_PROP_SKIP = "Set as 1 to skip any READ/WRITE actions for a row, which is equivalent to hiding a row."
const TOOLTIP_FOR_PROP_RESPONSE = "Action + HTTP error code + JSON response\n\n" +
"HTTP Error codes:\n";
"-200: Successful.\n-201: Successfully POSTed.\n-409: Found a conflict when POSTing\n";
const TOOLTIP_FOR_PROP_RESPONSE_TIME = "Time of latest response";


function getTooltipForCommentedProp(prop) {
  if (prop === HEADER_COMMENTED_PROP_SKIP) {
    return TOOLTIP_FOR_PROP_SKIP;
  }
  else if(prop === HEADER_COMMENTED_PROP_RESPONSE) {
    return TOOLTIP_FOR_PROP_RESPONSE;
  }
  else if(prop === HEADER_COMMENTED_PROP_RESPONSE_TIME) {
    return TOOLTIP_FOR_PROP_RESPONSE_TIME;
  }
}

function makeMetadataUrl(method, profileName, endpoint, identifyingVal) {
  switch(method) {
    case "GET":
      return `${endpoint}/${profileName}/${identifyingVal}/?format=json&frame=object`;
    case "PUT":
    case "PATCH":
      return `${endpoint}/${profileName}/${identifyingVal}`;
    case "POST":
      return `${endpoint}/${profileName}`;
    default:
      Logger.log("makeMetadataUrl: Not supported method " + method);      
  }
}

function getMetadataFromPortal(identifyingVal, identifyingProp, profileName, endpoint, forAdmin=false) {
  var url = makeMetadataUrl("GET", profileName, endpoint, identifyingVal);
  var response = restGet(url);
  var error = response.getResponseCode();

  var object = {
    [HEADER_COMMENTED_PROP_RESPONSE]: "GET" + "," + error,
    [HEADER_COMMENTED_PROP_RESPONSE_TIME]: getCurrentLocalTimeString(""),
    [identifyingProp]: identifyingVal
  };

  var responseJson = JSON.parse(response.getContentText());
  if (error === 200) {
    // filter out non gettable property
    // see function isGettableProp in Profile.gs for details
    var profile = getProfile(profileName, endpoint);
    var filteredResponseJson = Object.keys(responseJson)
      .filter((prop) => isGettableProp(profile, prop, forAdmin))
      .reduce((cur, prop) => { return Object.assign(cur, { [prop]: responseJson[prop] })}, {});

    // then merge it with commented properties
    object = {...object, ...filteredResponseJson};
  }
  else {
    // if error, write helpText to provide debugging information
    object[HEADER_COMMENTED_PROP_RESPONSE] += "\n" + JSON.stringify(responseJson, null, HELP_TEXT_INDENT);
  }
  return object;
}

function getSortedProps(props, profile, propPriority=DEFAULT_PROP_PRIORITY) {
  // sort metadata's props by given profile and propPriority
  // - props in propPriority come first if exists
  // - and then props under required key in profile come next
  // - all the other commented (#) props come last
  var sortedProps = [];

  // priority props first
  for (var prop of propPriority.concat(profile["required"])) {
    if (props.includes(prop) && !sortedProps.includes(prop)) {
      sortedProps.push(prop);
    }
  }

  // non-commented props
  for (var prop of props) {
    if (!prop.startsWith("#") && !sortedProps.includes(prop)) {
      sortedProps.push(prop);
    }
  }

  // and then commented props
  for (var prop of props) {
    if (prop.startsWith("#") && !sortedProps.includes(prop)) {
      sortedProps.push(prop);
    }
  }
  return sortedProps;
}

function updateSheetWithMetadataFromPortal(sheet, profileName, endpointForGet, endpointForProfile, forAdmin=false) {
  var profile = getProfile(profileName, endpointForProfile);

  // check #skip column exists. if so skip row with #skip===1
  var skipCol = findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_SKIP);

  // update each row if has accession value
  var numUpdated = 0;
  for (var row = HEADER_ROW + 1; row <= getLastRow(sheet); row++) {
    if (isRowHidden(sheet, row)) {
      continue;
    }
    if (skipCol && toBoolean(getCellValue(sheet, row, skipCol))) {
      continue;
    }

    var [identifyingProp, identifyingVal, identifyingCol] =
      findIdentifyingPropValColInRow(sheet, row, profile);

    if (!identifyingProp || !identifyingVal) {
      continue;
    }

    var metadataObj = getMetadataFromPortal(
      identifyingVal, identifyingProp, profileName, endpointForGet, forAdmin
    );
    var sortedProps = getSortedProps(Object.keys(metadataObj), profile);
    writeJsonToRow(sheet, metadataObj, row, sortedProps);
    numUpdated++;
  }

  if (numUpdated > 0) {
    setLastUsedSchemaVersion(sheet, getProfileSchemaVersion(profile));
  }

  return numUpdated;
}

function exportSheetToJson(sheet, profileName, endpointForProfile, keepCommentedProps) {
  var profile = getProfile(profileName, endpointForProfile);

  var result = [];
  for (var row = HEADER_ROW + 1; row <= getLastRow(sheet); row++) {
    var jsonBeforeTypeCast = rowToJson(
      sheet, row, keepCommentedProps=false, bypassGoogleAutoParsing=true
    );
    var json = typeCastJsonValuesByProfile(profile, jsonBeforeTypeCast);
    result.push(json);
  }

  return result;
}

function exportSheetToJsonFile(sheet, profileName, endpointForProfile, keepCommentedProps, jsonFilePath) {
  var json = exportSheetToJson(sheet, profileName, endpointForProfile, keepCommentedProps)
  DriveApp.createFile(jsonFilePath, JSON.stringify(json, null, EXPORTED_JSON_INDENT));
}

function convertRowToJson(sheet, row, profileName, endpointForProfile, keepCommentedProps) {
  // do rowToJson and then typecast according to profile
  var profile = getProfile(profileName, endpointForProfile);
  var jsonBeforeTypeCast = rowToJson(
    sheet, row, keepCommentedProps=false, bypassGoogleAutoParsing=true
  );
  return typeCastJsonValuesByProfile(profile, jsonBeforeTypeCast);
}

function findIdentifyingPropValColInRow(sheet, row, profile) {
  // for a given row, find the first valid identifying prop/value/col.
  // if indentifying value is an array type then take the first element.
  //
  // returns prop, value, col

  // sorted based on identifying prop priority
  // e.g. "accession" has highest priority
  var sortedIdProp = [...profile["identifyingProperties"]];
  sortedIdProp.sort(
    (a,b) => getIdentifyingPropPriority(a) - getIdentifyingPropPriority(b),
  );

  for (var identifyingProp of sortedIdProp) {
    var identifyingCol = findColumnByHeaderValue(sheet, identifyingProp);
    var identifyingVal = identifyingCol ? getCellValue(sheet, row, identifyingCol) : undefined;

    if (identifyingVal) {
      // if indentifying value is an array type then take the first element
      identifyingVal = isArrayProp(profile, identifyingProp) ? JSON.parse(identifyingVal)[0] : identifyingVal;
      return [
        identifyingProp,
        identifyingVal,
        identifyingCol
      ];
    }
  }
  return [undefined, undefined, undefined];
}


function setAttachment(attachmentJson) {
  // attachmentJson has "path" property only
  var path = attachmentJson["path"];
  if (!path) {
    alertBox(
      'attachment is not a valid JSON string. A valid example format is {"path": "/GOOGLE/DRIVE/PATH/file.pdf"}.'
    );
    return;
  }

  var file = getDriveFileFromPath(path);
  if (!file) {
    alertBox(`${path} not found on Google Drive.`);
    return;
  }

  var mimeType = file.getMimeType();
  if (mimeType === "application/x-gzip") {
    mimeType = "application/gzip";
  }

  var base64EncodedStr = Utilities.base64Encode(file.getBlob().getBytes());

  var attachment = {
    download: getBasename(path),
    type: mimeType,
    href: `data:${mimeType};base64,${base64EncodedStr}`
  }
  return attachment;
}

function submitSheetToPortal(
  sheet, profileName, endpointForPut, endpointForProfile, method, selectedColsForPatch=[]
) {
  // returns actual number of submitted rows
  var profile = getProfile(profileName, endpointForProfile);

  const numData = getNumMetadataInSheet(sheet);
  var numSubmitted = 0;

  for (var row = HEADER_ROW + 1; row <= numData + HEADER_ROW; row++) {
    var jsonBeforeTypeCast = rowToJson(
      sheet, row, keepCommentedProps=true, bypassGoogleAutoParsing=true,
    );

    if (isRowHidden(sheet, row)) {
      continue;
    }
    // if has #skip and it is 1 then skip
    if (jsonBeforeTypeCast.hasOwnProperty(HEADER_COMMENTED_PROP_SKIP)) {
      if (toBoolean(jsonBeforeTypeCast[HEADER_COMMENTED_PROP_SKIP])) {
        continue;
      }
    }

    var json = typeCastJsonValuesByProfile(
      profile, jsonBeforeTypeCast, keepCommentedProps=false
    );

    // if there is an attachment (e.g. document profile)
    // then read from Google Drive, base64encode its content
    if (
      hasAttachment(profile) &&
      json.hasOwnProperty(HEADER_PROP_ATTACHMENT) &&
      json[HEADER_PROP_ATTACHMENT]
    ) {
      // overwrite on payload's attachment
      var attachment = setAttachment(json[HEADER_PROP_ATTACHMENT]);
      if (!attachment) {
        continue;
      }
      json[HEADER_PROP_ATTACHMENT] = attachment;
    }

    var payloadJson = {};

    // filter JSON with selectedColsForPatch
    if (method === "PATCH" && selectedColsForPatch.length > 0) {
      const selectedHeaderProps = selectedColsForPatch.map((x) => x.headerProp);
      for (var prop of Object.keys(json)) {
        if (selectedHeaderProps.includes(prop)) {
          payloadJson[prop] = json[prop];
        }
      }

    } else {
      payloadJson = JSON.parse(JSON.stringify(json));
    }

    switch(method) {
      case "PUT":
      case "PATCH":
        var [identifyingProp, identifyingVal, identifyingCol] =
          findIdentifyingPropValColInRow(sheet, row, profile);

        if (!identifyingProp || !identifyingVal) {
          continue;
        }

        var url = makeMetadataUrl(method, profileName, endpointForPut, identifyingVal);
        var response = restSubmit(url, payloadJson=payloadJson, method=method);
        break;

      case "POST":
        var url = makeMetadataUrl(method, profileName, endpointForPut);
        var response = restSubmit(url, payloadJson=payloadJson, method=method);
        break;

      default:
        Logger.log("submitSheetToPortal: Wrong REST method " + method);
        continue;
    }

    var error = response.getResponseCode();
    var responseJson = JSON.parse(response.getContentText());

    jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] = method + "," + error;
    if (method === "PATCH") {
      jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "\nSelected props: ";
      if (selectedColsForPatch.length === 0) {
        jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "ALL";
      } else {
        jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += selectedColsForPatch.map(x => x.headerProp).join(",");
      }
    }

    jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE_TIME] = getCurrentLocalTimeString("");

    switch(error) {
      case 200:
        break;

      case 201:
        // POST assigns new values to identifying properties (e.g. uuid, accession)
        // so update row with those new identifying values
        profile["identifyingProperties"].forEach(prop => {
          if (!isCommentedProp(profile, prop)) {
            jsonBeforeTypeCast[prop] = responseJson["@graph"][0][prop];
          }
        });
        jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "\n" + JSON.stringify(responseJson, null, HELP_TEXT_INDENT);
        break;

      case 422:
        // validation failure
        jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "\nIf error message is not helpful, try Validate on the menu.\n"

      default:
        jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "\n" + JSON.stringify(responseJson, null, HELP_TEXT_INDENT);
    }

    // rewrite data, with commented headers such as error and text, on the sheet
    writeJsonToRow(sheet, jsonBeforeTypeCast, row);
    numSubmitted++;
  }

  if (numSubmitted > 0) {
    setLastUsedSchemaVersion(sheet, getProfileSchemaVersion(profile));
  }

  return numSubmitted;
}

function validateSheet(sheet, profileName, endpointForProfile) {
  // returns actual number of submitted rows
  var profile = getProfile(profileName, endpointForProfile);

  const numData = getNumMetadataInSheet(sheet);
  var numSubmitted = 0;

  for (var row = HEADER_ROW + 1; row <= numData + HEADER_ROW; row++) {
    var jsonBeforeTypeCast = rowToJson(
      sheet, row, keepCommentedProps=true, bypassGoogleAutoParsing=true
    );

    if (isRowHidden(sheet, row)) {
      continue;
    }
    // if has #skip and it is 1 then skip
    if (jsonBeforeTypeCast.hasOwnProperty(HEADER_COMMENTED_PROP_SKIP)) {
      if (toBoolean(jsonBeforeTypeCast[HEADER_COMMENTED_PROP_SKIP])) {
        continue;
      }
    }

    var json = typeCastJsonValuesByProfile(
      profile, jsonBeforeTypeCast, keepCommentedProps=false
    );

    var validationResult = validateJson(profile, filterOutCommentedProps(json));
    if (validationResult.valid) {
      json[HEADER_COMMENTED_PROP_RESPONSE] = "ValidationSuccess";
    } else {
      json[HEADER_COMMENTED_PROP_RESPONSE] = JSON.stringify(validationResult.errors, null, 2);
    }
    json[HEADER_COMMENTED_PROP_RESPONSE_TIME] = getCurrentLocalTimeString("");
    // rewrite data, with commented headers such as error and text, on the sheet
    writeJsonToRow(sheet, json, row);
    numSubmitted++;
  }
  return numSubmitted;
}

function createNewSheetAndGetMetadata(sheet, profileName, endpoint) {
  // Copy current sheet's identifying columns to a new sheet
  // and then do GET to get latest metadata from the portal

  var spreadsheet = SpreadsheetApp.getActive();
  var currentSheetName = sheet.getName();
  var profile = getProfile(profileName, endpoint);

  var identifyingCols = [];
  
  for (var prop of profile["identifyingProperties"]) {
    var col = findColumnByHeaderValue(sheet, prop);
    if (col) {
      identifyingCols.push(col);
    }
  }

  if (!identifyingCols) {
    Logger.log("Couldn't find an identifying column.")
    return;
  }

  var schemaVersion = getProfileSchemaVersion(profile);
  var newSheetName = `${currentSheetName}_v${schemaVersion}`;
  if (spreadsheet.getSheetByName(newSheetName)) {
    alertBox(`Faild to create a new sheet since it already exists: ${newSheetName}.`);
    return;
  }

  // create a new sheet and SET FOCUS ON IT
  var newSheet = createNewSheet(newSheetName, true);

  // write id cols to a new sheet
  var currentNewSheetCol = 1;
  for (var col of identifyingCols) {
    var valuesToCopy = sheet.getRange(HEADER_ROW, col, sheet.getLastRow(), 1).getValues();
    newSheet.getRange(HEADER_ROW, currentNewSheetCol, valuesToCopy.length, 1).setValues(valuesToCopy);
    currentNewSheetCol++;
  }

  // copy DeveloperMetadata (profile name) to new sheet
  setProfileName(newSheet, getProfileName(sheet));

  // run GET on new sheet to get metadata from the portal
  getMetadataForAll(forAdmin=false, showWarning=false)
}

const DEFAULT_BASE_TEMPLATE = {
  [HEADER_COMMENTED_PROP_RESPONSE]: null,
  [HEADER_COMMENTED_PROP_RESPONSE_TIME]: null,
};

function makeMetadataTemplateFromProfile(profile, forAdmin=false, template=DEFAULT_BASE_TEMPLATE) {
  // add all properties except for non-editable ones
  // if default exists for a prop then use it
  // otherwise use null for prop
  var result = JSON.parse(JSON.stringify(template));
  for (var prop of Object.keys(profile["properties"])) {
    if (!isPostableProp(profile, prop, forAdmin)) {
      continue;
    }
    // null if default does not exist
    result[prop] = getDefaultForProp(profile, prop);
  }

  return result;
}

function addMetadataTemplateToSheet(sheet, profile, forAdmin=false) {
  var metadataObj = makeMetadataTemplateFromProfile(profile, forAdmin);
  var sortedProps = getSortedProps(Object.keys(metadataObj), profile);
  addJsonToSheet(sheet, metadataObj, sortedProps);
  // for schema version checking
  setLastUsedSchemaVersion(sheet, getProfileSchemaVersion(profile));
}

function createNewSheetAndMakeTemplate(profileName, endpoint) {
  var spreadsheet = SpreadsheetApp.getActive();
  var profile = getProfile(profileName, endpoint);

  if (spreadsheet.getSheetByName(profileName)) {
    alertBox(`Faild to create a new sheet since it already exists: ${profileName}.`);
    return;
  }

  // create a new sheet (no need to set focus on it)
  var newSheet = createNewSheet(profileName, false);
  setProfileName(newSheet, profileName);
}

const HEADER_PROP_ACCESSION = "accession";
const HEADER_PROP_UUID = "uuid";
const HEADER_PROP_NAME = "name";
const HEADER_PROP_ALIASES = "aliases";
const HEADER_PROP_AWARD = "award";
const HEADER_PROP_LAB = "lab";
const HEADER_PROP_S3_URI = "s3_uri";
const HEADER_PROP_ATTACHMENT = "attachment";
const BIG_NUMBER_FOR_PRIORITY_SORTING = 1000;

// determines the column order of properties in the header
const DEFAULT_PROP_PRIORITY = [
  HEADER_COMMENTED_PROP_SKIP,
  HEADER_COMMENTED_PROP_RESPONSE,
  HEADER_COMMENTED_PROP_RESPONSE_TIME,
  HEADER_COMMENTED_PROP_UPLOAD_ABSPATH,
  HEADER_COMMENTED_PROP_UPLOAD_STATUS,
  HEADER_COMMENTED_PROP_UPLOAD_CMD,
  HEADER_PROP_ACCESSION,
  HEADER_PROP_UUID,
  HEADER_PROP_NAME,
  HEADER_PROP_ALIASES,
  HEADER_PROP_AWARD,
  HEADER_PROP_LAB,
];

const IDENTIFYING_PROP_PRIORITY = [
  HEADER_PROP_ACCESSION,
  HEADER_PROP_UUID,
  HEADER_PROP_NAME
];

// https://github.com/ENCODE-DCC/encoded/blob/dev/docs/auth.rst#permissions
// This is for "permission" property
const ADMIN_OR_SYSTEM_PERMISSIONS = [
  "add_unvalidated",
  "edit_unvalidated",
  "expand",
  "impersonate",
  "import_items",
  "index",
  "submit_for_any",
  "view_raw"
]

const COLOR_PROP_DEFAULT = "black";
const COLOR_PROP_REQUIRED = "red";
const COLOR_PROP_INDENTIFYING = "blue";
const COLOR_PROP_READONLY = "lightgray";
const COLOR_PROP_HAS_DO_NOT_SUBMIT_IN_COMMENT = "lightgray";
const COLOR_PROP_NOT_SUBMITTABLE = "lightgray";
const COLOR_PROP_COMMENTED = "black";
const FORMAT_SEARCHABLE_PROP = "underline";
const FORMAT_ARRAY_PROP = "italic,bold";

const SELECTED_PROP_KEYS_FOR_TOOLTIP = [
  "title",
  "description",
  "comment",
  "type",
  "readonly",
  "notSubmittable",
  "linkTo",
];

function isValidProfileName(profileName, endpoint) {
  for(var name of getAllProfiles(endpoint)) {
    // make capitalized sentence from snakecase 
    var capitalizedName = capitalizeWord(snakeToCamel(name));
    if ([name, capitalizedName].includes(profileName)) {
      return true;
    }
  }
}

function makeProfileUrl(profileName, endpoint, format="json") {
  switch(format) {
    case "json":
      return `${endpoint}/profiles/${profileName}?format=json`;
    default:
      return `${endpoint}/profiles/${profileName}`;
  }
}

function isSearchableProp(profile, prop) {
  if (!profile || prop.startsWith("#")) {
    return false;
  }
  var propInProfile = profile["properties"][prop];
  // if linkTo (single object) or items.linkTo (array) exists
  // then it's searchable
  return propInProfile.hasOwnProperty("linkTo") ||
    propInProfile.hasOwnProperty("items") && propInProfile["items"].hasOwnProperty("linkTo");
}

function isArrayProp(profile, prop) {
  if (!profile || prop.startsWith("#")) {
    return false;
  }
  var propType = getPropType(profile, prop);
  return propType && propType === "array";
}

function makeSearchUrlForProp(profile, prop, endpoint) {
  if (!isSearchableProp(profile, prop)) {
    return;
  }

  var propInProfile = profile["properties"][prop];
  var linkTo = propInProfile.hasOwnProperty("linkTo") ?
    propInProfile["linkTo"] : propInProfile["items"]["linkTo"];

  // Search uses UI endpoint so convert to UI endpoint if available
  const uiEndpoint = getUIEndpoint(endpoint);

  if (isEncodeEndpoint(endpoint)) {
    return `${uiEndpoint}/search/?type=${linkTo}`;
  } else {
    return `${uiEndpoint}/search?type=${linkTo}`;
  }
}

function getPropType(profile, prop) {
  if (!profile || !profile["properties"].hasOwnProperty(prop)) {
    return;
  }
  return profile["properties"][prop]["type"];
}

function isRequiredProp(profile, prop) {
  // try find required property in a recursive fashion ("anyOf")
  // 1. "required" is "anyOf", then try to find "required" in subProfile
  // 2. "required" in this

  if (profile.hasOwnProperty("required")) {
    return profile["required"].includes(prop);

  } else if (profile.hasOwnProperty("anyOf")) {
    for (subProfile of profile["anyOf"]) {
      if (isRequiredProp(subProfile, prop)) {
        return true;
      }
    }
  }
  return false;
}

function isIdentifyingProp(profile, prop) {
  return profile["identifyingProperties"].includes(prop);
}

function isReadonlyProp(profile, prop) {
  var propInProfile = profile["properties"][prop];
  return propInProfile.hasOwnProperty("readonly") && propInProfile["readonly"];
}

function isNotSubmittableProp(profile, prop) {
  var propInProfile = profile["properties"][prop];
  return propInProfile.hasOwnProperty("notSubmittable") && propInProfile["notSubmittable"];
}

function isNonEditableProp(profile, prop) {
  return isReadonlyProp(profile, prop) || isNotSubmittableProp(profile, prop);
}

function isCommentedProp(profile, prop) {
  return prop.startsWith("#");
}

function hasDoNotSubmitInPropComment(profile, prop) {
  var propInProfile = profile["properties"][prop];
  return propInProfile.hasOwnProperty("comment") &&
    propInProfile["comment"].toLowerCase().startsWith("do not submit");
}

function hasAttachment(profile) {
  return profile["properties"].hasOwnProperty(HEADER_PROP_ATTACHMENT) &&
    profile["properties"][HEADER_PROP_ATTACHMENT]["attachment"];
}

function isAdminOrSystemProp(profile, prop) {
  var propInProfile = profile["properties"][prop];
  return propInProfile.hasOwnProperty("permission")
    && ADMIN_OR_SYSTEM_PERMISSIONS.includes(propInProfile["permission"]);
}

function isGettableProp(profile, prop, forAdmin=false) {
  if (!profile["properties"].hasOwnProperty(prop)) {
    return false;
  }
  if (forAdmin) {
    return !isNotSubmittableProp(profile, prop);
  } else {
    return isRequiredProp(profile, prop)
      || isIdentifyingProp(profile, prop)
      || !isNonEditableProp(profile, prop)
      && !hasDoNotSubmitInPropComment(profile, prop)
      && !isAdminOrSystemProp(profile, prop)
  }
}

function isPostableProp(profile, prop, forAdmin=false) {
  return isGettableProp(profile, prop, forAdmin);
}

function getColorForProp(profile, prop) {
  if (isCommentedProp(profile, prop)) {
    return COLOR_PROP_COMMENTED;
  }
  if (isRequiredProp(profile, prop)) {
    return COLOR_PROP_REQUIRED;
  }
  if (isIdentifyingProp(profile, prop)) {
    return COLOR_PROP_INDENTIFYING;
  }
  if (isReadonlyProp(profile, prop)) {
    return COLOR_PROP_READONLY;
  }
  if (hasDoNotSubmitInPropComment(profile, prop)) {
    return COLOR_PROP_HAS_DO_NOT_SUBMIT_IN_COMMENT;
  }
  if (isNotSubmittableProp(profile, prop)) {
    return COLOR_PROP_NOT_SUBMITTABLE;
  }
  return COLOR_PROP_DEFAULT;
}

function getDefaultForProp(profile, prop) {
  var propInProfile = profile["properties"][prop];
  if (propInProfile && propInProfile.hasOwnProperty("default")) {
    return propInProfile["default"];
  }
  // returns null if default does not exist
  return null;
}

function getProfile(profileName, endpoint) {
  var url = makeProfileUrl(profileName, endpoint);
  var response = restGet(url);
  if (response.getResponseCode() === 200) {
    // adhoc way to fix buggy schema (invalid escapes: \\:, \\-)
    // examples of wrong pattern:
    //  "^(PMID:[0-9]+|doi:10\\.[0-9]{4}[\\d\\s\\S\\:\\.\\/]+|PMCID:PMC[0-9]+|[0-9]{4}\\.[0-9]{4})$";
    //  "^(\\d+(\\.[1-9])?(\\-\\d+(\\.[1-9])?)?)$"
    raw_text = response.getContentText();
    fixed_text = raw_text
      .replace(/\\\\S\\\\:/g, "\\\\S:")
      .replace(/\\\\-/g, "-");
    return JSON.parse(fixed_text);
  }
}

function typeCastValueByProfile(profile, prop, val) {
  // correct types for metadata submission according to types defined in profile
  var propInProfile = profile["properties"][prop];
  if (propInProfile && propInProfile["type"] == "string" && getType(val) == "number") {
    return val.toString();
  }
  return val;
}

function typeCastJsonValuesByProfile(profile, json, keepCommentedProps) {
  var result = {};
  for (var prop of Object.keys(json)) {
    if (prop.startsWith("#") && !keepCommentedProps) {
      Logger.log("typeCastJsonValuesByProfile: startsWith #: " + prop + " " + keepCommentedProps);
      continue;
    }
    result[prop] = typeCastValueByProfile(profile, prop, json[prop]);
  }
  return result;
}

function filterOutCommentedProps(json) {
  var result = {};
  for (var prop of Object.keys(json)) {
    if (prop.startsWith("#")) {
      continue;
    }
    result[prop] = json[prop];
  }
  return result;
}


function getPropInDependentSchemas(profile, prop) {
  if (!profile.hasOwnProperty("dependentSchemas")) {
    return;
  }
  var dependentSchemas = profile["dependentSchemas"];
  if (!dependentSchemas.hasOwnProperty(prop)) {
    return;
  }
  return dependentSchemas[prop];
}

function makeTooltipForProp(profile, prop) {
  var propInProfile = profile["properties"][prop];

  var tooltip = isSearchableProp(profile, prop) ?
    "SEARCH AVAILABLE\n\n" : "";

  tooltip += SELECTED_PROP_KEYS_FOR_TOOLTIP
    .filter(key => propInProfile.hasOwnProperty(key))
    .map(key => {return `* ${key}\n${propInProfile[key]}`})
    .join('\n\n');

  // find linkTo for Array type and add it to tooltip
  if (propInProfile.hasOwnProperty("items") && propInProfile.items.hasOwnProperty("linkTo")) {
    tooltip += `\n\n* linkTo\n${propInProfile.items.linkTo}`;
  }

  // find submissionExample for Array type and add it to tooltip
  if (propInProfile.hasOwnProperty("submissionExample")) {
    if (propInProfile.submissionExample.hasOwnProperty("appscript")) {
      tooltip += `\n\n* submissionExample (appscript)\n${propInProfile.submissionExample.appscript}`;
    }
    if (propInProfile.submissionExample.hasOwnProperty("igvf_utils")) {
      tooltip += `\n\n* submissionExample (igvf_utils)\n${propInProfile.submissionExample.igvf_utils}`;
    }
  }

  // additionally find comment in dependency and add to tooltip
  var dependencyProp = getPropInDependentSchemas(profile, prop)
  if (dependencyProp && dependencyProp.hasOwnProperty("comment")) {
    tooltip += `\n\n* dependency\n${dependencyProp["comment"]}`;
  }

  return tooltip;
}

function setColorAndTooltipForHeaderProp(sheet, profile, prop, col) {
  if (prop === "") {
    return;
  }

  var tooltip = prop.startsWith("#") ? 
    getTooltipForCommentedProp(prop) : makeTooltipForProp(profile, prop);

  setCellTooltip(sheet, HEADER_ROW, col, tooltip);
  setCellColor(sheet, HEADER_ROW, col, getColorForProp(profile, prop));

  if (!prop.startsWith("#")) {
    var styles = [];
    if (isSearchableProp(profile, prop)) {
      styles.push(FORMAT_SEARCHABLE_PROP)
    }
    if (isArrayProp(profile, prop)) {
      styles.push(FORMAT_ARRAY_PROP)
    }
    if (styles) {
      setCellFormat(sheet, HEADER_ROW, col, styles.join(","));
    }
  }
}

function addDropdownMenuToDataCell(sheet, profile, prop, col) {
  if (prop === "" || prop.startsWith("#")) {
    return;
  }

  var propInProfile = profile["properties"][prop];
  if (propInProfile === undefined) {
    Logger.log(`Property ${prop} does not exist in profile ${profile["title"]}. Wrong profile?`);
    return;
  }
  
  if (!propInProfile.hasOwnProperty("enum")) {
    return;
  }

  var enums = propInProfile["enum"];
  var lastRow = getLastRow(sheet);
  // if lastRow is just the header then set lastRow as next line
  if (lastRow === HEADER_ROW) {
    lastRow = HEADER_ROW + 1;
  }
  var range = getRange(sheet, HEADER_ROW + 1, col, lastRow - HEADER_ROW, 1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(enums).build();  
  range.setDataValidation(rule);
}

function highlightHeaderAndDataCell(sheet, profile) {
  var currentHeaderProps = getCellValuesInRow(sheet, HEADER_ROW);

  var missingProps = [];
  for (var [i, prop] of currentHeaderProps.entries()) {
    var col = i + 1;

    if (!isCommentedProp(profile, prop) && !profile["properties"].hasOwnProperty(prop)) {
      Logger.info(
        `Property ${prop} does not exist in current profile(${profile.title})\n\n` +
        "Possible mismatch between profile and accession?"
      );
      missingProps.push(prop);
      continue;
    }

    setColorAndTooltipForHeaderProp(sheet, profile, prop, col);
    addDropdownMenuToDataCell(sheet, profile, prop, col);
  }
  return missingProps;
}

function getIdentifyingPropPriority(prop) {
  // return value
  // - 0: highest priority
  // - BIG_NUMBER_FOR_PRIORITY_SORTING: lowest priority
  //   (if prop doesn't exist in IDENTIFYING_PROP_PRIORITY
  //    then return BIG_NUMBER_FOR_PRIORITY_SORTING)

  var index = IDENTIFYING_PROP_PRIORITY.indexOf(prop);
  if (index === -1) {
    return BIG_NUMBER_FOR_PRIORITY_SORTING;
  }
  return index;
}

function getProfileSchemaVersion(profile) {
  return profile["properties"]["schema_version"]["default"];
}

function checkProfile() {
  // check profile for current sheet

  var profileName = getProfileName();

  if (getProfileName()) {
    var profile = getProfile(getProfileName(), getEndpoint())

    if (!profile) {
      alertBox(
        "Found profile name but couldn't get profile from portal. Wrong credentials?\n" +
        "Go to the menu 'IGVF' -> 'Authorize for IGVF' (or 'LATTICE' -> 'Authorize for LATTICE') and input access key and secret pair."
      );
      return;
    }

    // check schema versions of profile and sheet
    // if they don't match then halt and show warning
    const sheetSchemaVersion = getLastUsedSchemaVersion();
    const profileSchemaVersion = getProfileSchemaVersion(profile);

    if (sheetSchemaVersion && sheetSchemaVersion !== profileSchemaVersion) {
      if (alertBoxOkCancel(
          "Found schema version mismatch (current sheet vs. portal).\n\n" +
          `- Current sheet's last used schema version: ${sheetSchemaVersion}\n` +
          `- Portal's latest schema version: ${profileSchemaVersion}\n\n` +
          "Would you like to automatically create a new sheet with updated schema?"
      )) {
        updateCurrentSheet();
      }
      return;
    }
    return true;
  }

  alertBox(
    "No profile name found.\n" +
    'Go to the menu "IGVF" (or "LATTICE") -> "Set profile name".'
  );
}

function checkProfileForPost() {
  // check profile for current sheet

  var profileName = getProfileName();

  if (getProfileName()) {
    var profile = getProfile(getProfileName(), getEndpoint())

    if (!profile) {
      alertBox(
        "Found profile name but couldn't get profile from portal. Wrong credentials?\n" +
        "Go to the menu 'IGVF' -> 'Authorize for IGVF' (or 'LATTICE' -> 'Authorize for LATTICE') and input access key and secret pair."
      );
      return;
    }

    // check schema versions of profile and sheet
    // if they don't match then halt and show warning
    const sheetSchemaVersion = getLastUsedSchemaVersion();
    const profileSchemaVersion = getProfileSchemaVersion(profile);

    if (sheetSchemaVersion && sheetSchemaVersion !== profileSchemaVersion) {
      alertBox(
          "Found schema version mismatch (current sheet vs. portal).\n\n" +
          `- Current sheet's last used schema version: ${sheetSchemaVersion}\n` +
          `- Portal's latest schema version: ${profileSchemaVersion}\n\n` +
          "Please create a new tab and pull the latest profile."
      );
      return;
    }
    return true;
  }

  alertBox(
    "No profile name found.\n" +
    'Go to the menu "IGVF" -> "Set profile name".'
  );
}
const SEARCH_BOX_WIDTH = 700;
const SEARCH_BOX_HEIGHT = 500;


function openSearch(url, prop, propType, endpoint, selectedCellValue) {
  var html = HtmlService.createTemplateFromFile("SearchTemplate");
  html.url = url;
  html.propType = propType;
  html.endpoint = endpoint;
  if (propType == "array") {
    if (selectedCellValue === "") {
      selectedCellValue = '[]';
    }
    html.text = JSON.parse(selectedCellValue).join("\n");
  } else {
    html.text = selectedCellValue;
  }

  var htmlOutput = html
    .evaluate()
    .setWidth(SEARCH_BOX_WIDTH)
    .setHeight(SEARCH_BOX_HEIGHT);
 
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Search for ${prop}`);
}

function clickAccept(newCellValue) {
  getCurrentSheet().getActiveCell().setValue(newCellValue);
}

function clickCancel() {
}

const HEADER_ROW = 1;


function setDevMetadata(scope, key, val) {
  var currentVal = getDevMetadata(scope, key);
  if (currentVal) {
    // delete existing metadata
    var finder = scope.createDeveloperMetadataFinder().withKey(key).find();
    finder[0].remove();
  }
  if (val === undefined) {
    // Dev Metadata does not allow undefined value and we already deleted the key
    // so simply do nothing here
    // this effectively resets the key
    return;
  }
  // DeveloperMetadataVisibility.DOCUMENT allows sharing of metadata properties
  scope.addDeveloperMetadata(
    key, val, SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT
  );
}

function getDevMetadata(scope, key) {
  // assume uniqueness
  const metadataFinder = scope.createDeveloperMetadataFinder();
  var metadata = metadataFinder.withKey(key).find();
  if (metadata.length) {
    var val = metadata[0].getValue();
    return val;
  }
}

function getCurrentSheet() {
  return SpreadsheetApp.getActive().getActiveSheet();
}

function setSheetDevMetadata(sheet, key, val) {
  setDevMetadata(sheet, key, val);
}

function getSheetDevMetadata(sheet, key) {
  return getDevMetadata(sheet, key);
}

function getAllDevMetadata(sheet, filtKeyPrefix) {
  var metadataFinder = sheet.createDeveloperMetadataFinder();
  var results = metadataFinder.find();
  var devMetadata = [];
  for (var i = 0; i < results.length; i++) {
    if (!filtKeyPrefix || results[i].getKey().startsWith(filtKeyPrefix)) {
      Logger.log('id: ' + results[i].getId() + ', key: ' + results[i].getKey());
      devMetadata.push({[results[i].getKey()]: results[i].getValue()});
    }
  }
  return devMetadata;
}

function getSheetAllDevMetadata(sheet) {
  return getAllDevMetadata(sheet);
}

function setCurrentSheetDevMetadata(key, val) {
  setSheetDevMetadata(getCurrentSheet(), key, val);
}

function getCurrentSheetDevMetadata(key) {
  return getSheetDevMetadata(getCurrentSheet(), key);
}

function setSpreadsheetDevMetadata(key, val) {
  // adhoc method to separate two different scopes (spreadsheet and sheet)
  // add prefix "spreadsheet" to key for spreadsheet one
  setDevMetadata(SpreadsheetApp.getActive(), "spreadsheet-" + key, val);
}

function getSpreadsheetDevMetadata(key) {
  // adhoc method to separate two different scopes (spreadsheet and sheet)
  // add prefix "spreadsheet" to key for spreadsheet one
  return getDevMetadata(SpreadsheetApp.getActiveSpreadsheet(), "spreadsheet-" + key);
}

function getSpreadsheetAllDevMetadata() {
  return getAllDevMetadata(SpreadsheetApp.getActiveSpreadsheet(), filtKeyPrefix="spreadsheet-");
}

function getNumMetadataInSheet(sheet, ignoreHiddenRows=false) {
  var numRows = 0;
  for (var row = HEADER_ROW + 1; row <= getLastRow(sheet); row++) {
    if (!ignoreHiddenRows || ignoreHiddenRows && !isRowHidden(sheet, row)) {
      numRows += 1;
    }
  }
  return numRows;
}

function isSheetEmpty(sheet) {
  return sheet.getDataRange().isBlank();
}

function isRowHidden(sheet, row) {
  return sheet.isRowHiddenByUser(row);
}

function isColumnHidden(sheet, col) {
  return sheet.isColumnHiddenByUser(col);
}

function getCellValue(sheet, row, col) {
  return sheet.getRange(row, col).getValue();
}

function getLastNonEmptyColumnInRow(sheet, row) {
  // returns 0 if there isn't non-empty cell in row
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return 0;
  };
  var rowDataVals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  for (var i = rowDataVals.length - 1; i >= 0; i--) {
    if (rowDataVals[i] !== "") {
      return i + 1;
    }
  }
  return 0;
}

function getLastNonEmptyRowInColumn(sheet, col) {
  // returns 0 if there isn't non-empty cell in row
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return 0;
  };
  var colDataVals = sheet.getRange(1, col, lastRow, 1).getValues()[0];
  for (var i = colDataVals.length - 1; i >= 0; i--) {
    if (colDataVals[i] !== "") {
      return i + 1;
    }
  }
  return 0;
}

function getCellValuesInRow(sheet, row) {
  var lastNonEmptyColumnInRow = getLastNonEmptyColumnInRow(sheet, row);
  if (lastNonEmptyColumnInRow === 0) {
    return [];
  } else {
    var range = sheet.getRange(row, 1, 1, lastNonEmptyColumnInRow);
    return range.getValues()[0];
  }
}

function getCellValuesInColumn(sheet, col) {
  var lastNonEmptyRowInColumn = getLastNonEmptyRowInColumn(sheet, col);
  if (lastNonEmptyRowInColumn === 0) {
    return [];
  } else {
    var range = sheet.getRange(1, col, lastNonEmptyRowInCol, 1);
    return range.getValues()[0];
  }
}

function getLastRow(sheet) {
  return sheet.getLastRow();
}

function getLastColumn(sheet) {
  return sheet.getLastColumn();
}

function findColumnByHeaderValue(sheet, val) {
  for (var [i, headerVal] of getCellValuesInRow(sheet, HEADER_ROW).entries()) {
    var col = i + 1;
    if (headerVal === val) {
      return col;
    }
  }
}

function getRange(sheet, rowStart, colStart, rowLength, colLength) {
  return sheet.getRange(rowStart, colStart, rowLength, colLength);
}

function setCellColor(sheet, row, col, color) {
  if (color) {
    sheet.getRange(row, col).setFontColor(color);
  }
}

function setCellFormat(sheet, row, col, formats) {
  // formats: comma-separated formats
  // supported format: italic, bold, underline
  var range = sheet.getRange(row, col);
  for (var format of formats.split(",")) {
    switch(format) {
      case "italic":
        range.setFontStyle("italic");
        break;
      case "bold":
        range.setFontWeight("bold");
        break;
      case "underline":
        range.setFontLine("underline");
        break;
      default:
        Logger.log("setCellFormat: not a supported format " + format);
    }
  }
}

function setCellTooltip(sheet, row, col, tooltip) {
  if (tooltip) {
    sheet.getRange(row, col).setNote(tooltip);
  }
}

function setRangeAlignTop(sheet) {
  sheet.getDataRange().setVerticalAlignment("top");
}

function clearDataValidationsInSheet(sheet) {
  sheet.getDataRange().clearDataValidations();
}

function clearFormatInSheet(sheet) {
  sheet.getDataRange().clearFormat();
}

function clearNoteInSheet(sheet) {
  sheet.getDataRange().clearNote();
}

function clearContentInSheet(sheet) {
  sheet.getDataRange().clearContent();
}

function clearFontColorInSheet(sheet) {
  sheet.getDataRange().setFontColor(null);
}

function writeRangeToCells(sheet, startRow, startCol, vals) {
  if (vals.length === 0 || vals[0].length === 0) {
    return;
  }
  // vals: 2d array with dimensions (row, col)
  var rowLen = vals.length;
  var colLen = vals[0].length;
  sheet.getRange(startRow, startCol, rowLen, colLen).setValues(vals);
}

function writeToCell(sheet, row, col, val) {
  writeRangeToCells(sheet, row, col, [[val]]);
}

function updateHeaderWithArray(sheet, arr) {
  // returns re-ordered array:
  // props in current header + new props in arr
  var currentProps = getCellValuesInRow(sheet, HEADER_ROW);
  var newProps = arr.filter(prop => !currentProps.includes(prop));

  writeRangeToCells(sheet, HEADER_ROW, currentProps.length + 1, [newProps]);
  return currentProps.concat(newProps);
}

function updateCellByHeaderAndRow(header, row, value) {
  // find column by header and update
}

function writeJsonToRow(sheet, json, row, props) {
  // `props` is an optional input array to have an ordered list of props in `json`
  // the order of `props` is kept (so it's important) when new props are added to header

  var jsonProps = props ? props : Object.keys(json);
  var extendedHeaderProps = updateHeaderWithArray(sheet, jsonProps);

  var arr = extendedHeaderProps.map(prop => {
    if (json.hasOwnProperty(prop)) {
      var val = json[prop];
      if (["array", "object"].includes(getType(val))) {
        return JSON.stringify(val);
      } else if (val === null) {
        return "";
      }
      return val;
    }
    return "";
  });
  writeRangeToCells(sheet, row, 1, [arr]);
}

function addJsonToSheet(sheet, json, props) {
  var lastRow = Math.max(getLastRow(sheet), HEADER_ROW) + 1;
  writeJsonToRow(sheet, json, lastRow, props);
}

function getSelectedColumns(sheet, keepCommentedProps=true) {
  // return a list of selected column's ID (col) and property {col, headerProp}
  // ignore columns without valid header
  var cols = [];
  var ranges = sheet.getSelection().getActiveRangeList().getRanges();
  for (var i = 0; i < ranges.length; i++) {
    for (var j = 0; j < ranges[i].getNumColumns(); j++) {
      var col = ranges[i].getColumn() + j;
      var headerProp = getCellValue(sheet, HEADER_ROW, col);
      if (!keepCommentedProps && headerProp.startsWith("#")) {
        continue;
      }
      if (headerProp) {
        cols.push({col, headerProp});
      }
    }
  }
  return cols;
}

function rowToJson(sheet, row, keepCommentedProps, bypassGoogleAutoParsing) {  
  // if bypassGoogleAutoParsing is set then use displayValue (string)
  // instead of auto-parsed value
  var currentProps = getCellValuesInRow(sheet, HEADER_ROW);
  var range = sheet.getRange(row, 1, 1, currentProps.length);
  var rowDataVals = range.getValues()[0];
  var rowDataDisplayVals = range.getDisplayValues()[0];
  var result = {};

  for (var [i, data] of rowDataVals.entries()) {
    var prop = currentProps[i];

    if (prop.startsWith("#") && !keepCommentedProps) {
      continue;
    }

    var val = data;
    if (val === "") {
      Logger.log("rowToJson (skipping prop with empty val): " + prop);
      continue;
    }

    if (bypassGoogleAutoParsing && getType(val) == "object") {
      val = rowDataDisplayVals[i];
      Logger.log("rowToJson (use displayValue for object): " + prop + " " + val);
    }

    if (getType(val) === "string") {
      // if array/object then JSON.parse it
      if (isJsonString(val) || isArrayString(val)) {
        val = JSON.parse(val);
      }
    }

    result[prop] = val;
  }
  return result;
}

function createNewSheet(newSheetName, activate=false) {  
  var spreadsheet = SpreadsheetApp.getActive();
  var newSheet = spreadsheet.insertSheet();
  newSheet.setName(newSheetName);

  if (activate) {
    newSheet.activate();
  }
  return newSheet;
}

function insertColumnLeftmostWithHeadersAndTooltips(sheet, headers, tooltips, skipExistingHeader=true) {
  // insert columns to the leftmost with headers array
  // can skip existing header
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];

    if (skipExistingHeader && findColumnByHeaderValue(sheet, header)) {
      continue;
    }
    const col = 1;
    sheet.insertColumnBefore(col);
    sheet.getRange(HEADER_ROW, col).setValue(header);

    if (tooltips) {
      var tooltip = tooltips[i];
      setCellTooltip(sheet, HEADER_ROW, col, tooltip);
    }
  }
}

/*
Getters and setters for data stored in Google's Developer Metadata.
Such data include values for "Settings" of this tool.

Key names are shared between Spreadsheet and Sheet (current sheet by default).
But they are stored separately in different scopes.

e.g. getSpreadsheetDevMetadata vs. getSheetDevMetadata(sheet)

Dev Notes:

As of 0.3.0, script uses the same endpoint for both read/write actions
but script still uses KEY_ENDPOINT_WRITE for backward compatibility
*/

// still using "endpointWrite" for backward compatibility
const KEY_ENDPOINT_WRITE = "endpointWrite";
const KEY_PROFILE_NAME = "profileName";
const KEY_LAST_USED_SCHEMA_VERSION = "lastUsedSchemaVersion";


function getDefaultEndpoint() {
  var defaultEndpoint = getSpreadsheetDevMetadata(KEY_ENDPOINT_WRITE);
  return defaultEndpoint ? defaultEndpoint : DEFAULT_ENDPOINT_WRITE
}

function getEndpoint() {
  // As of 0.3.0, it's just a wrapper for default endpoint
  return getDefaultEndpoint();
}

function getProfileName(sheet) {
  var profileName = getSheetDevMetadata(
    sheet ? sheet : getCurrentSheet(),
    KEY_PROFILE_NAME
  );
  return profileName ? profileName : null;
}

function getLastUsedSchemaVersion(sheet) {
  return getSheetDevMetadata(
    sheet ? sheet : getCurrentSheet(),
    KEY_LAST_USED_SCHEMA_VERSION
  );
}

function setDefaultEndpoint(input) {
  var endpoint = input ? input : Browser.inputBox(
    `* Current endpoint:\\n${getDefaultEndpoint()}\\n\\n` +
    "* Supported IGVF endpoints:\\n" +
    `${getIgvfEndpointsAvailableForUsers().join("\\n")}\\n\\n` +
    "* Supported LATTICE endpoints:\\n" +
    `${getLatticeEndpointsAvailableForUsers().join("\\n")}\\n\\n` +
    'Enter a new endpoint:'
  );

  if (endpoint) {
    endpoint = trimTrailingSlash(endpoint);
  }
  if (!isValidEndpoint(endpoint)) {
    if (endpoint !== "cancel") {
      alertBox("Wrong endpoint: " + endpoint);
    }
    return;
  }

  setSpreadsheetDevMetadata(KEY_ENDPOINT_WRITE, endpoint);
}

function setEndpoint(sheet, input) {
  // As of 0.3.0, it's just a wrapper for default endpoint
  setDefaultEndpoint(input);
}

function setProfileName(sheet, input) {    
  var profileName = input ? input : Browser.inputBox(
    `* Current profile name:\\n${getProfileName(sheet)}\\n\\n` +
    "Snakecase (with _) or capitalized CamelCase are allowed for a profile name.\\n" +
    "No plural (s) is allowed in profile name.\\n" +
    "(e.g. MeasurementSet, measurement_set, sequence_file, lab):\\n\\n" +
    "Enter a new profile name:"
  );
  if (getProfileName(sheet) && getProfileName(sheet) !== profileName) {
    // if profile name has changed then reset last used schema version
    resetLastUsedSchemaVersion(sheet);
  }
  if (!isValidProfileName(profileName, getEndpoint())) {
    alertBox("ZOPA ->" + input + "<- APOZ");

    if (profileName !== "cancel") {
      alertBox("Wrong profile name: " + profileName);
    }
    return;
  }
  setSheetDevMetadata(
    sheet ? sheet : getCurrentSheet(),
    KEY_PROFILE_NAME,
    profileName
  );
  // if sheet is empty then make a template row automatically
  var currentSheet = sheet ? sheet : getCurrentSheet();
  if (isSheetEmpty(currentSheet)) {
    makeTemplate(currentSheet, forAdmin=false, newSheet=true);
  }
}

function setLastUsedSchemaVersion(sheet, input) {
  var schemaVersion = input ? input : Browser.inputBox(
    `* Current sheet's last used schema version:\\n${getLastUsedSchemaVersion(sheet)}\\n\\n` +
    "Enter a new schema version:"
  );
  setSheetDevMetadata(
    sheet ? sheet : getCurrentSheet(),
    KEY_LAST_USED_SCHEMA_VERSION,
    schemaVersion
  );
}

function resetLastUsedSchemaVersion(sheet) {
  setSheetDevMetadata(
    sheet ? sheet : getCurrentSheet(),
    KEY_LAST_USED_SCHEMA_VERSION,
    undefined
  );
}

function showSheetAllDevMetadata(sheet) {
  var allMetadata = getSheetAllDevMetadata(
    sheet ? sheet : getCurrentSheet()
  );
  alertBox(JSON.stringify(allMetadata, null, 4));
}

function showSpreadsheetAllDevMetadata() {
  var allMetadata = getSpreadsheetAllDevMetadata();
  alertBox(JSON.stringify(allMetadata, null, 4));
}

function testGoogleDrive() {
    var paths = [
      // "/test_submitter_attachment/aaaa/ENCFF356LFX.bed.gz",
      // "/test_submitter_attachment/aaaa/ok.tsv",
      // "/test_submitter_attachment/aaaa/file_example_TIFF_1MB.tiff",
      // "/test_submitter_attachment/aaaa/image.png",
      "/test_submitter_attachment/aaaa/mmce_1_2_1_userguide.pdf",
      // "/test_submitter_attachment/aaaa/outputs.json",
      "/test_submitter_attachment/aaaa/x.jpg",
    ];
    for (path of paths) {
      var file = getDriveFileFromPath(path);

      var mimeType = file.getMimeType();
      Logger.log(`${path}: ${mimeType}`);

      var base64EncodedStr = Utilities.base64Encode(file.getBlob().getBytes());
      Logger.log(base64EncodedStr);
    }
}

const UPLOAD_CREDENTIALS = "upload_credentials";
const IDENTIFYING_VAL = "identifying_val";
const IDENTIFYING_PROP = "identifying_prop";

const TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_ABSPATH = "Define absolute paths of files for each row to be uploaded.";
const TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_STATUS = "Shows status of uploading.";
const TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_CMD = 'Shows "aws s3api" command line to manually upload local files.';

function openUploadSidebar() {
  var sheet = getCurrentSheet();

  if ( !findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_ABSPATH)
    || !findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_STATUS) ) {
    if (alertBoxOkCancel(
      "To use file uploading, please add the following commented columns to the header and try again:\n\n"
      + `${HEADER_COMMENTED_PROP_UPLOAD_ABSPATH} : ${TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_ABSPATH}\n`
      + `${HEADER_COMMENTED_PROP_UPLOAD_STATUS} : ${TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_CMD}\n\n`
      + "Would you like to add them automatically to the sheet?"
    )) {
      insertColumnLeftmostWithHeadersAndTooltips(
        sheet,
        [HEADER_COMMENTED_PROP_UPLOAD_ABSPATH, HEADER_COMMENTED_PROP_UPLOAD_STATUS],
        [TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_ABSPATH, TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_STATUS],
      );
    }
    return;
  }

  var html = HtmlService.createTemplateFromFile("UploaderSideBar.html");
  var htmlOutput = html
    .evaluate();

  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function getUploadCredentialsFromFileId(fileId) {
  var endPoint = getEndpoint();

  var url = `${endPoint}/${fileId}@@upload?format=json&frame=object`;
  var response = restGet(url);
  var error = response.getResponseCode();

  if (error === 200) {
    var responseJson = JSON.parse(response.getContentText());
    return responseJson["@graph"][0]["upload_credentials"];

  } else {
    Logger.log(`HTTP error ${error}: Failed to get upload credentials from endpoint ${endPoint} for file ID ${fileId}`);
  }
}

function getUploadCredentialsFromIdentifyingVal(identifyingVal) {
  var fileId = `files/${identifyingVal}/`;
  return getUploadCredentialsFromFileId(fileId);
}

function getFileStatusAndErrorFromFileId(fileId) {
  var endPoint = getEndpoint();

  var url = `${endPoint}/${fileId}?format=json&frame=object`;
  var response = restGet(url);
  var error = response.getResponseCode();

  if (error === 200) {
    var responseJson = JSON.parse(response.getContentText());
    var status = responseJson["status"];
    var contentError = status === "content error" ? responseJson["content_error_detail"]: null;

    return {status: status, contentError: contentError};

  } else {
    Logger.log(`HTTP error ${error}: Failed to get status and content_error from endpoint ${endPoint} for file ID ${fileId}`);
  }
}

function getFileStatusAndErrorFromIdentifyingVal(identifyingVal) {
  var fileId = `files/${identifyingVal}/`;
  return getFileStatusAndErrorFromFileId(fileId);
}

function initUpload() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();
  var profile = getProfile(getProfileName(), getEndpoint());

  // check if identifying property exists
  if (profile["identifyingProperties"]
    .filter(prop => findColumnByHeaderValue(sheet, prop))
    .length === 0) {
    alertBox(
      `Couldn't find an identifying property (${profile["identifyingProperties"].join(",")}) in header row ${HEADER_ROW}\n\n` +
      `Add a proper identifying property to the header row and define it for each data row to retrieve from the portal.`
    );
    return;
  }

  const numData = getNumMetadataInSheet(sheet);
  var results = [];

  for (var row = HEADER_ROW + 1; row <= numData + HEADER_ROW; row++) {
    var json = rowToJson(
      sheet, row, keepCommentedProps=true, bypassGoogleAutoParsing=true,
    );

    // if row is hidden, then skip
    if (isRowHidden(sheet, row)) {
      continue;
    }
    // if has #skip and it is 1 then skip
    if (json.hasOwnProperty(HEADER_COMMENTED_PROP_SKIP)) {
      if (toBoolean(json[HEADER_COMMENTED_PROP_SKIP])) {
        continue;
      }
    }
    var [identifyingProp, identifyingVal, identifyingCol] =
      findIdentifyingPropValColInRow(sheet, row, profile);

    if (!identifyingProp || !identifyingVal) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = "Missing identifying value (e.g. accession, uuid).";
      writeJsonToRow(sheet, json, row);
      continue;
    }

    // check status of file
    var {status, contentError} = getFileStatusAndErrorFromIdentifyingVal(identifyingVal);

    // prevent re-uploading to a released object
    if (status == "released") {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = "error: uploading to a released accession is not allowed.";
      writeJsonToRow(sheet, json, row);
      continue;
    }

    var uploadAbsPathCol = findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_ABSPATH);
    var uploadAbsPath = uploadAbsPathCol ? getCellValue(sheet, row, uploadAbsPathCol) : undefined;

    if (!uploadAbsPath) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = `Missing ${HEADER_COMMENTED_PROP_UPLOAD_ABSPATH}.`;
      writeJsonToRow(sheet, json, row);
      continue;
    }

    // get upload credentials from portal
    var uploadCredentials = getUploadCredentialsFromIdentifyingVal(identifyingVal);
    if (!uploadCredentials) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = "Failed to get upload credentials.";
      writeJsonToRow(sheet, json, row);
      continue;
    }
    const accessKeyId = uploadCredentials["access_key"];
    const secretAccessKey = uploadCredentials["secret_key"];
    const sessionToken = uploadCredentials["session_token"];
    const [,,bucket,] = uploadCredentials["upload_url"].split("/");
    const key = uploadCredentials["upload_url"].split("/").splice(3).join("/");

    // to report status on both sheet and upload sidebar
    // this json object will be passed to the upload sidebar
    if (contentError) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = `status: ${status}: ${contentError}.`;
    } else {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = `status: ${status}.`;
    }
    writeJsonToRow(sheet, json, row);

    // additional info to be passed to sidebar
    json[UPLOAD_CREDENTIALS] = uploadCredentials;
    json[IDENTIFYING_VAL] = identifyingVal;
    json[IDENTIFYING_PROP] = identifyingProp;
    results.push(json);
  }

  return [sheet.getName(), JSON.stringify(results)];
}

function updateStatusOnSheet(sheetName, identifyingProp, identifyingVal, status) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  var identifyingCol = findColumnByHeaderValue(sheet, identifyingProp);
  var uploadStatusCol = findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_STATUS);
  var skipCol = findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_SKIP);

  const numData = getNumMetadataInSheet(sheet);

  for (var row = HEADER_ROW + 1; row <= numData + HEADER_ROW; row++) {
    if (isRowHidden(sheet, row) || skipCol && toBoolean(getCellValue(sheet, row, skipCol))) {
      continue;
    }
    if (getCellValue(sheet, row, identifyingCol) == identifyingVal) {
      writeToCell(sheet, row, uploadStatusCol, status);
    }
  }
}

function generateS3UploadCmd() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  if ( !findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_ABSPATH)
    || !findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_CMD) ) {
    if (alertBoxOkCancel(
      "To use file uploading, please add the following commented columns to the header and try again:\n\n"
      + `${HEADER_COMMENTED_PROP_UPLOAD_ABSPATH} : ${TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_ABSPATH}\n`
      + `${HEADER_COMMENTED_PROP_UPLOAD_CMD} : ${TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_CMD}\n\n`
      + "Would you like to add them automatically to the sheet?"
    )) {
      insertColumnLeftmostWithHeadersAndTooltips(
        sheet,
        [HEADER_COMMENTED_PROP_UPLOAD_ABSPATH, HEADER_COMMENTED_PROP_UPLOAD_CMD],
        [TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_ABSPATH, TOOLTIP_HEADER_COMMENTED_PROP_UPLOAD_CMD],
      );
    }
    return;
  }

  var profile = getProfile(getProfileName(), getEndpoint());

  // check if identifying property exists
  if (profile["identifyingProperties"]
    .filter(prop => findColumnByHeaderValue(sheet, prop))
    .length === 0) {
    alertBox(
      `Couldn't find an identifying property (${profile["identifyingProperties"].join(",")}) in header row ${HEADER_ROW}\n\n` +
      `Add a proper identifying property to the header row and define it for each data row to retrieve from the portal.`
    );
    return;
  }

  const numData = getNumMetadataInSheet(sheet);
  var results = [];

  for (var row = HEADER_ROW + 1; row <= numData + HEADER_ROW; row++) {
    var json = rowToJson(
      sheet, row, keepCommentedProps=true, bypassGoogleAutoParsing=true,
    );

    // if row is hidden, then skip
    if (isRowHidden(sheet, row)) {
      continue;
    }
    // if has #skip and it is 1 then skip
    if (json.hasOwnProperty(HEADER_COMMENTED_PROP_SKIP)) {
      if (toBoolean(json[HEADER_COMMENTED_PROP_SKIP])) {
        continue;
      }
    }
    var [identifyingProp, identifyingVal, identifyingCol] =
      findIdentifyingPropValColInRow(sheet, row, profile);

    // check status of file
    var {status, contentError} = getFileStatusAndErrorFromIdentifyingVal(identifyingVal);

    // prevent re-uploading to a released object
    if (status == "released") {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = "error: uploading to a released accession is not allowed.";
      writeJsonToRow(sheet, json, row);
      continue;
    }

    var uploadAbsPathCol = findColumnByHeaderValue(sheet, HEADER_COMMENTED_PROP_UPLOAD_ABSPATH);
    var uploadAbsPath = uploadAbsPathCol ? getCellValue(sheet, row, uploadAbsPathCol) : undefined;

    if (!uploadAbsPath) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = `Missing ${HEADER_COMMENTED_PROP_UPLOAD_ABSPATH}.`;
      writeJsonToRow(sheet, json, row);
      continue;
    }

    // get upload credentials from portal
    var uploadCredentials = getUploadCredentialsFromIdentifyingVal(identifyingVal);
    if (!uploadCredentials) {
      json[HEADER_COMMENTED_PROP_UPLOAD_STATUS] = "Failed to get upload credentials.";
      writeJsonToRow(sheet, json, row);
      continue;
    }
    const accessKeyId = uploadCredentials["access_key"];
    const secretAccessKey = uploadCredentials["secret_key"];
    const sessionToken = uploadCredentials["session_token"];
    const [,,bucket,] = uploadCredentials["upload_url"].split("/");
    const key = uploadCredentials["upload_url"].split("/").splice(3).join("/");

    const cmd =
      `AWS_ACCESS_KEY_ID="${accessKeyId}" AWS_SECRET_ACCESS_KEY="${secretAccessKey}" AWS_SESSION_TOKEN="${sessionToken}" ` +
      `aws s3api put-object --bucket "${bucket}" --key "${key}" --body "${uploadAbsPath}"`;
    json[HEADER_COMMENTED_PROP_UPLOAD_CMD] = cmd;

    writeJsonToRow(sheet, json, row);
  }

}

/*
Menu functions
*/

const URL_GITHUB = "https://github.com/IGVF-DACC/igvf-metadata-submitter/tree/dev";


function search() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  var currentRow = sheet.getActiveCell().getRow();
  if (currentRow <= HEADER_ROW) {
    alertBox("Select a non-header data cell and run Search.");
    return;
  }
  var currentCol = sheet.getActiveCell().getColumn();
  if (!currentCol) {
    alertBox("Cannot find a column for the selected cell.");
    return;
  }
  var currentProp = getCellValue(sheet, HEADER_ROW, currentCol);
  var profile = getProfile(getProfileName(), getEndpoint());
  var endpoint = getEndpoint();

  var url = makeSearchUrlForProp(profile, currentProp, endpoint);

  if (url) {
    var propType = profile["properties"][currentProp]["type"];
    var selectedCellValue = SpreadsheetApp.getActiveSheet().getActiveCell().getValue();
    openSearch(
      url, currentProp, propType, getUIEndpoint(endpoint), selectedCellValue,
    );
  } else {
    alertBox("Couldn't find Search URL for selected column's property.");
  }
}

function uploadSidebar() {
  openUploadSidebar()
}

function openProfilePage() {
  if (!checkProfile()) {
    return;
  }

  openUrl(
    makeProfileUrl(getProfileName(), getEndpoint(), format="page")
  );
}

function openToolGithubPage() {
  openUrl(URL_GITHUB);
}

function showSheetInfoAndHeaderLegend() {
  alertBox(
    "* Settings\n" +
    `- Endpoint: ${getEndpoint()}\n` +
    `- Profile name: ${getProfileName()}\n` +
    `- Last used schema version of profile: ${getLastUsedSchemaVersion()}\n\n` +

    "* Color legends for header properties\n" +
    "- red: required property\n" +
    "- blue: identifying property\n" +
    "- black: other editable property\n" +
    "- gray: ADMIN only property (readonly,nonSubmittable,'Do not submit')\n\n" +

    "* Commented properties (filtered out when being sent to the portal)\n" +
    "- #skip: Set it to 1 to skip any READ/WRITE REST action for a row.\n" +
    "- #response: Debugging info. Action + HTTP error code + JSON response.\n" +
    "- #response_time: Debugging info. Time of recent action.\n\n" +

    "* Style legends for properties\n" +
    "- Underline: Searachable property. Go to menu 'Search'.\n" +
    "- Italic+Bold: Array type property."
  );

}

function applyProfileToSheet(sheet, profile, newSheet=false) {
  if (!profile && !checkProfile()) {
    return;
  }
  if (!sheet) {
    sheet = getCurrentSheet();
  }
  var profileName = getProfileName(sheet);
  if (!profile) {
    profile = getProfile(profileName, getEndpoint());
  }

  // clear tooltip and dropdown menus for non-empty sheets only
  if (!newSheet) {
    clearFontColorInSheet(sheet);
    clearNoteInSheet(sheet);
    clearFormatInSheet(sheet);
    clearDataValidationsInSheet(sheet);
  }

  // align all text to TOP to make more readable
  setRangeAlignTop(sheet);

  var missingProps = highlightHeaderAndDataCell(sheet, profile);
  if (missingProps.length > 0) {
    alertBox(
      "Some properties are missing in the given profile.\n" +
      "- Possible mismatch between profile and accession?\n\n" +
      "* Current profile: " + profileName + "\n\n" +
      "* Missing properties:\n" + missingProps.join(", ")
    );
  }
}

function makeTemplate(sheet, forAdmin=false) {
  if (!checkProfile()) {
    return;
  }

  if (!sheet) {
    sheet = getCurrentSheet();
  }
  var profileName = getProfileName(sheet);
  var profile = getProfile(profileName, getEndpoint());

  addMetadataTemplateToSheet(sheet, profile, forAdmin);

  applyProfileToSheet(sheet, profile);
}

function makeTemplateForAdmin() {
  makeTemplate(getCurrentSheet(), forAdmin=true);
}

function makeTemplateForUser() {
  makeTemplate(getCurrentSheet(), forAdmin=false);
}

function getMetadataForAll(forAdmin, showWarning=true) {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();
  var profile = getProfile(getProfileName(), getEndpoint());

  if (profile["identifyingProperties"]
    .filter(prop => findColumnByHeaderValue(sheet, prop))
    .length === 0) {
    alertBox(
      `Couldn't find an identifying property (${profile["identifyingProperties"].join(",")}) in header row ${HEADER_ROW}\n\n` +
      `Add a proper identifying property to the header row and define it for each data row to retrieve from the portal.`
    );
    return;
  }

  var numData = getNumMetadataInSheet(sheet, ignoreHiddenRows=true);
  if (showWarning && numData && !alertBoxOkCancel(
    `Found ${numData} data row(s).\n\n` + 
    "THIS ACTION CAN OVERWRITE DATA ON UNHIDDEN ROWS.\n\n" +
    "Are you sure to proceed?")) {
    return;
  }

  var numUpdated = updateSheetWithMetadataFromPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), forAdmin,
  );
  if (showWarning) {
    alertBox(`Updated ${numUpdated} rows.`);
  }

  applyProfileToSheet();
}

function getMetadataForAllForAdmin() {
  return getMetadataForAll(forAdmin=true);
}

function getMetadataForAllForUser() {
  return getMetadataForAll(forAdmin=false);
}

function validateJsonWithSchema() {
  if (!checkProfile()) {
    return;
  }

  var numSubmitted = validateSheet(
    getCurrentSheet(), getProfileName(), getEndpoint()
  );
  alertBox(`Validated ${numSubmitted} rows.`);
}

function convertSelectedRowToJson() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();
  var currentRow = sheet.getActiveCell().getRow();
  if (currentRow <= HEADER_ROW) {
    alertBox("Select a non-header data cell.");
    return;
  }

  var json = convertRowToJson(
    sheet, currentRow, getProfileName(), getEndpoint(), keepCommentedProps=false
  );
  var jsonText = JSON.stringify(json, null, EXPORTED_JSON_INDENT);

  var htmlOutput = HtmlService
      .createHtmlOutput(`<pre>${jsonText}</pre>`)
      .setWidth(500)
      .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Row: ${currentRow}`);
}

function putAll() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  var numData = getNumMetadataInSheet(sheet, ignoreHiddenRows=true);
  if (numData === 0) {
    alertBox(`Found no data to submit to the portal.`);
    return;
  }  
  if (!alertBoxOkCancel(
    `Found ${numData} data row(s).\n\n` + 
    "PUT action will REPLACE metadata on the portal with those on the sheet. " +
    "Therefore, any properties missing on the sheet will also be REMOVED from portal's metadata." +
    "If you are not an admin and just want to patch non-empty values of properties on the sheet, use PATCH instead.\n\n" +
    `Are you sure to PUT to ${getEndpoint()}?`)) {
    return;
  }

  var numSubmitted = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PUT"
  );
  alertBox(`Submitted (PUT) ${numSubmitted} rows to ${getEndpoint()}.`);
}

function patchSelected() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  var selectedCols = getSelectedColumns(sheet, keepCommentedProps=false);
  if (selectedCols.length === 0) {
    alertBox('Found no selected column(s) with valid header.');
    return;
  }

  var numData = getNumMetadataInSheet(sheet, ignoreHiddenRows=true);
  if (numData === 0) {
    alertBox(`Found no data to submit to the portal.`);
    return;
  }  
  if (!alertBoxOkCancel(
    `Found ${numData} data row(s).\n\n` +
    "PATCH action will REPLACE properties on the portal with data on selected columns only.\n\n" +
    `Selected properties: ${selectedCols.map(x => x.headerProp).join(",")}` + "\n\n" +
    `Are you sure to PATCH to ${getEndpoint()}?`)) {
    return;
  }

  var numSubmitted = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PATCH",
    selectedColsForPatch=selectedCols,
  );
  alertBox(`PATCHed ${numSubmitted} rows to ${getEndpoint()}.`);

  applyProfileToSheet();
}

function patchAll() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  var numData = getNumMetadataInSheet(sheet, ignoreHiddenRows=true);
  if (numData === 0) {
    alertBox(`Found no data to submit to the portal.`);
    return;
  }
  if (!alertBoxOkCancel(
    `Found ${numData} data row(s).\n\n` + 
    "PATCH action will REPLACE properties on the portal with data on the sheet.\n\n" +
    `Are you sure to PATCH to ${getEndpoint()}?`)) {
    return;
  } 

  var numSubmitted = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PATCH"
  );
  alertBox(`Submitted (PATCH) ${numSubmitted} rows to ${getEndpoint()}.`);
}

function postAll() {
  if (!checkProfileForPost()) {
    return;
  }

  var sheet = getCurrentSheet();

  var numData = getNumMetadataInSheet(sheet, ignoreHiddenRows=true);
  if (numData === 0) {
    alertBox(`Found no data to submit to the portal.`);
    return;
  }  
  if (!alertBoxOkCancel(
    `Found ${numData} data row(s).\n\n` +
    "POST action will submit new objects (rows on the sheet) to the portal.\n\n" +
    "And then it will UPDATE rows with new identifying properties (e.g. accession, uuid) assigned from the portal. " +
    "No other properties/values will be updated on the sheet even though some new properties with " +
    "default values are assigned to them on the portal.\n\n" +
    `You can add ${HEADER_COMMENTED_PROP_SKIP} column and set it to 1 for a row that you want to skip REST actions.\n\n` +
    `Are you sure to POST to ${getEndpoint()}?`)) {
    return;
  }

  var numSubmitted = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="POST"
  );
  alertBox(`Submitted (POST) ${numSubmitted} rows to ${getEndpoint()}.`);

  applyProfileToSheet();
}

function exportToJsonText() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();

  var json = exportSheetToJson(
    sheet, getProfileName(), getEndpoint(),
    keepCommentedProps=false,
  );

  var jsonText = JSON.stringify(json, null, EXPORTED_JSON_INDENT);

  var htmlOutput = HtmlService
      .createHtmlOutput(`<pre>${jsonText}</pre>`)
      .setWidth(500)
      .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Sheet: ${sheet.getName()}`);
}

function exportToJson() {
  if (!checkProfile()) {
    return;
  }

  var sheet = getCurrentSheet();
  var jsonFilePath = Browser.inputBox(
    "Enter JSON file path (e.g. metadata-submitter-09-09-1999.json):"
  );

  exportSheetToJsonFile(
    sheet, getProfileName(), getEndpoint(),
    keepCommentedProps=false,
    jsonFilePath=jsonFilePath,
  );
}

function authorize(server) {
  if (getUsername(server) && getPassword(server)) {
    if (!alertBoxOkCancel(
      `Access key and access key secret already exist for ${server}, are you sure to proceed?`)) {
      return;
    }
  }

  var username = Browser.inputBox(`Enter your access key for ${server}:`);
  if (!username || username === "cancel") {
    alertBox("Failed to update access key.");
    return;
  }
  setUsername(username, server);

  var password = Browser.inputBox(`Enter your access key secret for ${server}:`);
  if (!password || password === "cancel") {
    alertBox("Failed to update access key secret.");
    return;
  }
  setPassword(password, server);
}

function authorizeForEncode() {
  return authorize(ENCODE);
}

function authorizeForIgvf() {
  return authorize(IGVF);
}

function authorizeForLattice() {
  return authorize(LATTICE);
}

// currently developer only (debugging purpose)
function authorizeForAws() {
  if (getAwsAccessKey() && getAwsSecretAccessKey()) {
    if (!alertBoxOkCancel(
      `(Developer only) AWS access key and secret access key pair already exists, are you sure to proceed?`)) {
      return;
    }
  }

  var awsAccessKey = Browser.inputBox(`Enter your AWS access key:`);
  if (!awsAccessKey || awsAccessKey === "cancel") {
    alertBox("Failed to update AWS access key.");
    return;
  }
  setAwsAccessKey(awsAccessKey);

  var awsSecretAccessKey = Browser.inputBox(`Enter your AWS secret access key:`);
  if (!awsSecretAccessKey || awsSecretAccessKey === "cancel") {
    alertBox("Failed to update AWS secret access key.");
    return;
  }
  setAwsSecretAccessKey(awsSecretAccessKey);
}

function checkForUpdate() {
  const currentVersion = getScriptVersion();
  const latestVersion = getLatestScriptVersionFromGithub();
  const helpUrl = getUpdateHelpUrl(latestVersion);

  var updateHelp = '';
  if (currentVersion !== latestVersion) {
    updateHelp = `<p>New version ${latestVersion} is out on github.</p>` +
    `<p>Please check <a href="${getUpdateHelpUrl(latestVersion)}" target="_blank">` +
    'the update instruction</a></p>';
  }

  var htmlOutput = HtmlService
      .createHtmlOutput(
        `<p>Current script version: ${currentVersion}</p>` +
        `<p>Latest script version on github: ${latestVersion}</p>` +
        updateHelp
      )
      .setWidth(500)
      .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Check for script update');
}

function updateCurrentSheet() {
  var currentSheet = getCurrentSheet();
  updateSheet(currentSheet);
}

function updateSheet(sheet) {
  var endpoint = getEndpoint();

  // check if profile exists
  var profileName = getProfileName(sheet);
  if (!profileName) {
    alertBox(`No profile is defined for sheet ${sheet.getName()}`);
    return;
  }
  var profile = getProfile(profileName, endpoint);

  // check if Id col exists
  var identifyingCols = [];
  for (var prop of profile["identifyingProperties"]) {
    var col = findColumnByHeaderValue(sheet, prop);
    if (col) {
      identifyingCols.push(col);
    }
  }
  if (!identifyingCols) {
    alertBox(`Couldn't find an identifying column for sheet ${sheet.getName()}`);
    return
  }

  createNewSheetAndGetMetadata(sheet, profileName, endpoint);
}

function createSheetsForAllProfiles() {
  var endpoint = getEndpoint();
  var profiles = getAllProfilesForTemplateGeneration(endpoint);

  var existingProfileNames = [];
  // check if sheet with profile name already exists
  var spreadsheet = SpreadsheetApp.getActive();
  for (var profileName of profiles) {
    if (spreadsheet.getSheetByName(profileName)) {
      existingProfileNames.push(profileName);
    }
  }
  var existingSheetWarning = "";
  if (existingProfileNames) {
    existingSheetWarning =
      "Found existing sheet names with profiles. Skipping these profiles:\n\n" +
      JSON.stringify(existingProfileNames) +
      "\n\n\n";
    profiles = profiles.filter(item => !existingProfileNames.includes(item));
  }

  if (!alertBoxOkCancel(
    existingSheetWarning +
    "Are you sure to proceed to create template sheets for the following profiles?\n\n" +
    JSON.stringify(profiles))) {
    return;
  }

  for (var profileName of profiles) {
    createNewSheetAndMakeTemplate(profileName, endpoint);
  }
  alertBox("Successfully created template sheets.");
}

SCRIPT_VERSION='v0.3.6';
URL_LATEST_SCRIPT_VERSION='https://api.github.com/repos/igvf-dacc/igvf-metadata-submitter/releases/latest';
URL_PREFIX_UPDATE_HELP='https://github.com/IGVF-DACC/igvf-metadata-submitter/blob/';
URL_SUFFIX_UPDATE_HELP='/UPDATE.md';


function getScriptVersion() {
  return SCRIPT_VERSION;
}

function getLatestScriptVersionFromGithub() {
  var response = UrlFetchApp.fetch(URL_LATEST_SCRIPT_VERSION);
  return JSON.parse(response.getContentText()).tag_name;
}

function getUpdateHelpUrl(version) {
  return URL_PREFIX_UPDATE_HELP + version + URL_SUFFIX_UPDATE_HELP;
}

