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

// Submission batching/continuation knobs (see DEV.md for rationale).
// FETCH_CHUNK_SIZE balances throughput vs. per-batch payload size cap; tune
// lower if the portal starts returning 429s under fan-out.
const SUBMIT_FETCH_CHUNK_SIZE = 30;
// Apps Script user-triggered runs cap at ~6 min. We pause well before that to
// leave headroom for the trailing sheet write + trigger creation.
const SUBMIT_TIME_BUDGET_MS = 5 * 60 * 1000;
const SUBMIT_RESUME_TRIGGER_FUNCTION = 'resumeSubmitToPortal';
const SUBMIT_RESUME_STATE_KEY = 'LATTICE_SUBMIT_RESUME_STATE';
const SUBMIT_RESUME_DELAY_MS = 30 * 1000;

function newSubmissionStats(chunkSize) {
  return {
    sheetReadMs: 0,
    sheetWriteMs: 0,
    networkMs: 0,
    networkChunks: 0,
    chunkSize: chunkSize,
    rowsSubmitted: 0,
    pauses: 0,
  };
}

// Restore stats from a serialized resume state (or seed a fresh one).
function restoreSubmissionStats(serialized, chunkSize) {
  var stats = newSubmissionStats(chunkSize);
  if (serialized) {
    Object.keys(serialized).forEach(function(k) {
      if (stats.hasOwnProperty(k)) {
        stats[k] = serialized[k];
      }
    });
  }
  return stats;
}

function readSheetForSubmission(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < HEADER_ROW + 1 || lastCol < 1) {
    return {
      header: [], values: [], displayValues: [], hiddenRows: [],
      lastRow: lastRow, lastCol: lastCol,
    };
  }
  var headerRange = sheet.getRange(HEADER_ROW, 1, 1, lastCol);
  var header = headerRange.getValues()[0];
  var dataRange = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, lastCol);
  var values = dataRange.getValues();
  var displayValues = dataRange.getDisplayValues();
  // isRowHiddenByUser is per-row only; loop is unavoidable but stays in pure JS once cached.
  var hiddenRows = new Array(values.length);
  for (var i = 0; i < hiddenRows.length; i++) {
    hiddenRows[i] = sheet.isRowHiddenByUser(HEADER_ROW + 1 + i);
  }
  return {
    header: header, values: values, displayValues: displayValues,
    hiddenRows: hiddenRows, lastRow: lastRow, lastCol: lastCol,
  };
}

function findIdentifyingPropValFromCache(header, rowVals, profile) {
  var sortedIdProp = profile["identifyingProperties"].slice();
  sortedIdProp.sort(function(a, b) {
    return getIdentifyingPropPriority(a) - getIdentifyingPropPriority(b);
  });
  for (var i = 0; i < sortedIdProp.length; i++) {
    var prop = sortedIdProp[i];
    var col = header.indexOf(prop);
    if (col < 0) {
      continue;
    }
    var val = rowVals[col];
    if (val) {
      if (isArrayProp(profile, prop)) {
        if (typeof val === "string" && isArrayString(val)) {
          val = JSON.parse(val)[0];
        } else if (Array.isArray(val)) {
          val = val[0];
        }
      }
      return { prop: prop, val: val, col: col + 1 };
    }
  }
  return { prop: null, val: null, col: null };
}

function buildSubmissionItems(sheet, sheetData, profile, profileName, endpoint, method, selectedColsForPatch) {
  var items = [];
  for (var i = 0; i < sheetData.values.length; i++) {
    var row = HEADER_ROW + 1 + i;
    if (sheetData.hiddenRows[i]) {
      continue;
    }
    var jsonBeforeTypeCast = rowDataToJson(
      sheetData.header, sheetData.values[i], sheetData.displayValues[i],
      true, true
    );
    if (jsonBeforeTypeCast.hasOwnProperty(HEADER_COMMENTED_PROP_SKIP) &&
        toBoolean(jsonBeforeTypeCast[HEADER_COMMENTED_PROP_SKIP])) {
      continue;
    }
    var json = typeCastJsonValuesByProfile(profile, jsonBeforeTypeCast, false);

    // Attachments still happen up front: base64 of large files would blow past
    // the fetchAll batch cap; better to surface that before the batch starts.
    if (hasAttachment(profile) &&
        json.hasOwnProperty(HEADER_PROP_ATTACHMENT) &&
        json[HEADER_PROP_ATTACHMENT]) {
      var attachment = setAttachment(json[HEADER_PROP_ATTACHMENT]);
      if (!attachment) {
        continue;
      }
      json[HEADER_PROP_ATTACHMENT] = attachment;
    }

    var payloadJson;
    if (method === "PATCH" && selectedColsForPatch.length > 0) {
      payloadJson = {};
      var selectedHeaderProps = selectedColsForPatch.map(function(x) { return x.headerProp; });
      Object.keys(json).forEach(function(prop) {
        if (selectedHeaderProps.indexOf(prop) >= 0) {
          payloadJson[prop] = json[prop];
        }
      });
    } else {
      payloadJson = json;
    }

    var url;
    switch (method) {
      case "PUT":
      case "PATCH":
        var ident = findIdentifyingPropValFromCache(sheetData.header, sheetData.values[i], profile);
        if (!ident.prop || !ident.val) {
          continue;
        }
        url = makeMetadataUrl(method, profileName, endpoint, ident.val);
        break;
      case "POST":
        url = makeMetadataUrl(method, profileName, endpoint);
        break;
      default:
        Logger.log("buildSubmissionItems: Wrong REST method " + method);
        continue;
    }

    items.push({
      row: row,
      jsonBeforeTypeCast: jsonBeforeTypeCast,
      request: { url: url, method: method, payloadJson: payloadJson },
    });
  }
  return items;
}

function processSubmissionResponse(item, response, profile, method, selectedColsForPatch) {
  var error = response.getResponseCode();
  var responseJson;
  try {
    responseJson = JSON.parse(response.getContentText());
  } catch (e) {
    responseJson = { _parseError: String(e), _rawText: response.getContentText().substring(0, 500) };
  }

  item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] = method + "," + error;
  if (method === "PATCH") {
    item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "\nSelected props: ";
    if (selectedColsForPatch.length === 0) {
      item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] += "ALL";
    } else {
      item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] +=
        selectedColsForPatch.map(function(x) { return x.headerProp; }).join(",");
    }
  }
  item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE_TIME] = getCurrentLocalTimeString("");

  switch (error) {
    case 200:
      break;
    case 201:
      // POST returns the newly assigned identifying props (accession, uuid, etc.)
      profile["identifyingProperties"].forEach(function(prop) {
        if (!isCommentedProp(profile, prop)) {
          if (responseJson && responseJson["@graph"] && responseJson["@graph"][0]) {
            item.jsonBeforeTypeCast[prop] = responseJson["@graph"][0][prop];
          }
        }
      });
      item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] +=
        "\n" + JSON.stringify(responseJson, null, HELP_TEXT_INDENT);
      break;
    case 422:
      item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] +=
        "\nIf error message is not helpful, try Validate on the menu.\n";
      // Falls through intentionally — keep original behavior.
    default:
      item.jsonBeforeTypeCast[HEADER_COMMENTED_PROP_RESPONSE] +=
        "\n" + JSON.stringify(responseJson, null, HELP_TEXT_INDENT);
  }
}

// Writes back a chunk's worth of results with at most one header extension,
// one bounding-rect read, and one setValues. Rows in [minRow..maxRow] that
// weren't submitted (hidden/skipped) keep their existing values.
function writeSubmissionResultsForChunk(sheet, items) {
  if (items.length === 0) {
    return;
  }
  var sorted = items.slice().sort(function(a, b) { return a.row - b.row; });
  var minRow = sorted[0].row;
  var maxRow = sorted[sorted.length - 1].row;

  var lastCol = sheet.getLastColumn();
  var currentHeader = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var headerSet = {};
  currentHeader.forEach(function(p) { if (p) headerSet[p] = true; });
  var newProps = [];
  sorted.forEach(function(item) {
    Object.keys(item.jsonBeforeTypeCast).forEach(function(p) {
      if (!headerSet[p]) {
        headerSet[p] = true;
        newProps.push(p);
      }
    });
  });
  var extendedHeader = currentHeader.concat(newProps);
  if (newProps.length > 0) {
    sheet.getRange(HEADER_ROW, lastCol + 1, 1, newProps.length).setValues([newProps]);
  }

  var rectRows = maxRow - minRow + 1;
  var rectVals = sheet.getRange(minRow, 1, rectRows, extendedHeader.length).getValues();

  var itemByRow = {};
  sorted.forEach(function(item) { itemByRow[item.row] = item; });

  for (var r = 0; r < rectRows; r++) {
    var actualRow = minRow + r;
    var item = itemByRow[actualRow];
    if (!item) {
      continue;
    }
    for (var c = 0; c < extendedHeader.length; c++) {
      var prop = extendedHeader[c];
      if (!prop) {
        continue;
      }
      if (item.jsonBeforeTypeCast.hasOwnProperty(prop)) {
        var v = item.jsonBeforeTypeCast[prop];
        if (["array", "object"].indexOf(getType(v)) >= 0) {
          rectVals[r][c] = JSON.stringify(v);
        } else if (v === null) {
          rectVals[r][c] = "";
        } else {
          rectVals[r][c] = v;
        }
      }
    }
  }

  sheet.getRange(minRow, 1, rectRows, extendedHeader.length).setValues(rectVals);
}

// Persistence helpers for the continuation pattern. State is per-document so
// multiple users editing the same sheet share one in-flight submission.
function saveSubmitResumeState(state) {
  PropertiesService.getDocumentProperties().setProperty(
    SUBMIT_RESUME_STATE_KEY, JSON.stringify(state)
  );
}

function loadSubmitResumeState() {
  var raw = PropertiesService.getDocumentProperties().getProperty(SUBMIT_RESUME_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSubmitResumeState() {
  PropertiesService.getDocumentProperties().deleteProperty(SUBMIT_RESUME_STATE_KEY);
}

function scheduleSubmitResume() {
  ScriptApp.newTrigger(SUBMIT_RESUME_TRIGGER_FUNCTION)
    .timeBased()
    .after(SUBMIT_RESUME_DELAY_MS)
    .create();
}

function deleteSubmitResumeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === SUBMIT_RESUME_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function findSheetById(sheetId) {
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) {
      return sheets[i];
    }
  }
  return null;
}

function isSubmitResumeInFlight() {
  return loadSubmitResumeState() !== null;
}

function submitSheetToPortal(
  sheet, profileName, endpointForPut, endpointForProfile, method, selectedColsForPatch=[], resumeState=null
) {
  // Returns { numSubmitted, paused, total, stats } so the UI can show the
  // right post-run message (success vs. "will resume").
  if (!resumeState) {
    // Fresh run — drop any stale resume state/trigger left by an abandoned prior run.
    clearSubmitResumeState();
    deleteSubmitResumeTriggers();
  }
  var profile = getProfile(profileName, endpointForProfile);
  var sliceStart = Date.now();

  var sheetReadStart = Date.now();
  var sheetData = readSheetForSubmission(sheet);
  var sheetReadElapsed = Date.now() - sheetReadStart;

  var items = buildSubmissionItems(
    sheet, sheetData, profile, profileName, endpointForPut, method, selectedColsForPatch
  );
  var total = items.length;

  var stats = restoreSubmissionStats(resumeState && resumeState.stats, SUBMIT_FETCH_CHUNK_SIZE);
  stats.sheetReadMs += sheetReadElapsed;

  var startIdx = (resumeState && resumeState.nextItemIdx) || 0;
  if (startIdx >= total) {
    clearSubmitResumeState();
    deleteSubmitResumeTriggers();
    return { numSubmitted: stats.rowsSubmitted, paused: false, total: total, stats: stats };
  }

  for (var i = startIdx; i < total; i += SUBMIT_FETCH_CHUNK_SIZE) {
    if (Date.now() - sliceStart > SUBMIT_TIME_BUDGET_MS) {
      stats.pauses += 1;
      saveSubmitResumeState({
        sheetId: sheet.getSheetId(),
        sheetName: sheet.getName(),
        profileName: profileName,
        endpoint: endpointForPut,
        endpointForProfile: endpointForProfile,
        method: method,
        selectedColsForPatch: selectedColsForPatch,
        nextItemIdx: i,
        stats: stats,
      });
      // Best-effort cleanup of any earlier scheduled trigger before installing
      // a new one, so we don't end up with duplicate resume triggers.
      deleteSubmitResumeTriggers();
      scheduleSubmitResume();
      try {
        SpreadsheetApp.getActive().toast(
          "Submitted " + stats.rowsSubmitted + " of " + total + ". " +
            "Will auto-resume in ~" + Math.round(SUBMIT_RESUME_DELAY_MS / 1000) + "s.",
          "Lattice submitter",
          10
        );
      } catch (toastErr) {
        Logger.log("Toast on pause failed: " + toastErr);
      }
      return { numSubmitted: stats.rowsSubmitted, paused: true, total: total, stats: stats };
    }

    var chunk = items.slice(i, i + SUBMIT_FETCH_CHUNK_SIZE);
    var requests = chunk.map(function(item) { return item.request; });

    var netStart = Date.now();
    var responses = restSubmitAll(requests);
    stats.networkMs += Date.now() - netStart;
    stats.networkChunks += 1;

    for (var j = 0; j < responses.length; j++) {
      processSubmissionResponse(chunk[j], responses[j], profile, method, selectedColsForPatch);
    }

    var writeStart = Date.now();
    writeSubmissionResultsForChunk(sheet, chunk);
    stats.sheetWriteMs += Date.now() - writeStart;
    stats.rowsSubmitted += chunk.length;
  }

  clearSubmitResumeState();
  deleteSubmitResumeTriggers();

  if (stats.rowsSubmitted > 0) {
    setLastUsedSchemaVersion(sheet, getProfileSchemaVersion(profile));
  }

  return { numSubmitted: stats.rowsSubmitted, paused: false, total: total, stats: stats };
}

// Triggered by the time-based trigger installed when a run hits the time budget.
// Re-enters submitSheetToPortal with the saved cursor; deletes itself on completion.
function resumeSubmitToPortal() {
  var state = loadSubmitResumeState();
  if (!state) {
    Logger.log("resumeSubmitToPortal: no resume state; nothing to do.");
    deleteSubmitResumeTriggers();
    return;
  }
  var sheet = findSheetById(state.sheetId);
  if (!sheet) {
    Logger.log("resumeSubmitToPortal: sheet not found for ID " + state.sheetId +
      " (was '" + state.sheetName + "'). Clearing resume state.");
    clearSubmitResumeState();
    deleteSubmitResumeTriggers();
    return;
  }
  try {
    SpreadsheetApp.getActive().toast(
      "Resuming submission on '" + sheet.getName() + "'...",
      "Lattice submitter",
      8
    );
  } catch (e) {
    // Toast may fail if no user has the sheet open; ignore.
  }
  var result = submitSheetToPortal(
    sheet, state.profileName, state.endpoint, state.endpointForProfile,
    state.method, state.selectedColsForPatch || [], state
  );
  if (!result.paused) {
    try {
      SpreadsheetApp.getActive().toast(
        "Submission complete: " + result.numSubmitted + "/" + result.total + " rows.",
        "Lattice submitter",
        10
      );
    } catch (e) {
      // ignore
    }
  }
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
