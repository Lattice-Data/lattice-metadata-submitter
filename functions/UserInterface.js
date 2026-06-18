/*
Menu functions
*/

const URL_GITHUB = "https://github.com/Lattice-Data/lattice-metadata-submitter/tree/main";


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

// Builds the per-run timing summary appended to post-submission alerts so the
// user can see actual portal latency and decide whether to tune SUBMIT_FETCH_CHUNK_SIZE.
function formatSubmissionStats(stats) {
  if (!stats || !stats.networkChunks) {
    return "";
  }
  var netSec = stats.networkMs / 1000;
  var readSec = stats.sheetReadMs / 1000;
  var writeSec = stats.sheetWriteMs / 1000;
  var avgBatchMs = stats.networkMs / stats.networkChunks;
  var effectivePerRowMs = stats.rowsSubmitted > 0 ? stats.networkMs / stats.rowsSubmitted : 0;
  var summary =
    "\n\nTiming:" +
    "\n- Network: " + netSec.toFixed(1) + "s across " + stats.networkChunks +
      " batch(es) of up to " + stats.chunkSize +
      " (avg batch round-trip: " + avgBatchMs.toFixed(0) + " ms)." +
    "\n- Sheet read: " + readSec.toFixed(1) + "s; sheet write: " + writeSec.toFixed(1) + "s." +
    "\n- Effective per-row wall time (network / rows submitted): " + effectivePerRowMs.toFixed(0) + " ms.";
  if (stats.pauses > 0) {
    summary += "\n- Pauses for resume: " + stats.pauses + ".";
  }
  return summary;
}

function alertSubmissionResult(method, endpoint, result) {
  if (result.paused) {
    alertBox(
      `Submitted ${result.numSubmitted} of ${result.total} ${method} row(s) so far.\n\n` +
      `Reached the time budget for this slice. A background trigger will resume automatically in ~30 seconds.\n\n` +
      `Please do NOT edit the sheet until the run completes (toast notifications will appear when it resumes and finishes).` +
      formatSubmissionStats(result.stats)
    );
  } else {
    alertBox(
      `Submitted (${method}) ${result.numSubmitted} of ${result.total} row(s) to ${endpoint}.` +
      formatSubmissionStats(result.stats)
    );
  }
}

function putAll() {
  if (!checkProfile()) {
    return;
  }

  if (isSubmitResumeInFlight()) {
    if (!alertBoxOkCancel(
      "A previous submission run is currently paused and waiting to resume.\n\n" +
      "Starting a new run will overwrite the resume state. Continue anyway?"
    )) {
      return;
    }
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

  var result = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PUT"
  );
  alertSubmissionResult("PUT", getEndpoint(), result);
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

  var result = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PATCH",
    selectedColsForPatch=selectedCols,
  );
  alertSubmissionResult("PATCH", getEndpoint(), result);

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

  var result = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="PATCH"
  );
  alertSubmissionResult("PATCH", getEndpoint(), result);
}

function postAll() {
  if (!checkProfileForPost()) {
    return;
  }

  if (isSubmitResumeInFlight()) {
    if (!alertBoxOkCancel(
      "A previous submission run is currently paused and waiting to resume.\n\n" +
      "Starting a new run will overwrite the resume state. Continue anyway?"
    )) {
      return;
    }
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

  var result = submitSheetToPortal(
    sheet, getProfileName(), getEndpoint(), getEndpoint(), method="POST"
  );
  alertSubmissionResult("POST", getEndpoint(), result);

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

function authorize() {
  if (getUsername() && getPassword()) {
    if (!alertBoxOkCancel(
      "Access key and access key secret already exist for Lattice, are you sure to proceed?")) {
      return;
    }
  }

  var username = Browser.inputBox("Enter your Lattice access key:");
  if (!username || username === "cancel") {
    alertBox("Failed to update access key.");
    return;
  }
  setUsername(username);

  var password = Browser.inputBox("Enter your Lattice access key secret:");
  if (!password || password === "cancel") {
    alertBox("Failed to update access key secret.");
    return;
  }
  setPassword(password);
}

function authorizeForLattice() {
  return authorize();
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
  var latestVersion;
  try {
    latestVersion = getLatestScriptVersionFromGithub();
  } catch (err) {
    const releasesUrl = 'https://github.com/Lattice-Data/lattice-metadata-submitter/releases';
    var detailHtml = '<p>Could not determine the latest release tag from GitHub.</p>';
    var msg = err && err.message ? String(err.message) : '';
    if (msg.indexOf('LATTICE_RELEASE_CHECK_HTTP_') === 0) {
      var httpCode = Utilities.htmlEscape(msg.replace('LATTICE_RELEASE_CHECK_HTTP_', ''));
      detailHtml += '<p>GitHub returned HTTP ' + httpCode + ' instead of a redirect. You can retry later or open the releases page below.</p>';
    } else if (msg === 'LATTICE_RELEASE_CHECK_NO_LOCATION') {
      detailHtml += '<p>The response had no <code>Location</code> header. Open the releases page below to see the latest version.</p>';
    } else if (msg === 'LATTICE_RELEASE_CHECK_BAD_LOCATION') {
      detailHtml += '<p>The redirect target did not look like a release tag URL. Open the releases page below.</p>';
    } else if (msg === 'LATTICE_RELEASE_CHECK_EMPTY_TAG') {
      detailHtml += '<p>The latest release tag could not be parsed. Open the releases page below.</p>';
    } else {
      detailHtml += '<p>Something went wrong while contacting GitHub. Open the releases page below.</p>';
    }
    detailHtml += '<p><a href="' + releasesUrl + '" target="_blank" rel="noopener noreferrer">Open releases on GitHub</a></p>';
    var errOutput = HtmlService.createHtmlOutput(detailHtml)
        .setWidth(500)
        .setHeight(260);
    SpreadsheetApp.getUi().showModalDialog(errOutput, 'Check for script update');
    return;
  }

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
