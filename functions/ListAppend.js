/*
Append to list properties instead of replacing them.

The portal's PATCH replaces every property it is sent, lists included, so an
append is a read-merge-write done here, one batch of rows at a time:
  1. GET {object}/@@edit for the stored values and the object's ETag.
  2. Add each item from the cells that the portal's list doesn't already have.
     Rows naming the same object are merged into one write.
  3. PATCH only the lists that changed, with If-Match: <ETag>. If the object
     changed after step 1, the portal answers 412 and it is re-read and retried.
  4. Write the merged list back into the cell, so the sheet mirrors the portal.

Before sending and again before writing, each row is checked against what was
read at the start. A row that was sorted, moved or edited in the meantime is left
alone. Running it again is harmless: every merge starts from the portal's list.
*/

const APPEND_MAX_ATTEMPTS = 3;


function parseListCell(value) {
  // returns {items: [...]} or {error: "..."}; an empty cell has nothing to add
  if (value === "" || value === null || value === undefined) {
    return { items: [] };
  }
  if (typeof value === "string" && isArrayString(value)) {
    try {
      return { items: JSON.parse(value) };
    } catch (e) {
      // not valid JSON; reported below
    }
  }
  return {
    error: 'expected a JSON list such as ["item1", "item2"], got: ' + String(value).substring(0, 200)
  };
}

function stableStringify(value) {
  // JSON with object keys sorted, so equal objects give equal strings
  if (Array.isArray(value)) {
    return "[" + value.map(function(item) { return stableStringify(item); }).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    }).join(",") + "}";
  }
  return JSON.stringify(value);
}

function mergeListItems(existing, additions) {
  // Keeps the portal's list in order and appends each addition it doesn't have
  // yet. Repeats within `additions` are dropped too.
  var seen = new Set(existing.map(function(item) { return stableStringify(item); }));
  var merged = existing.slice();
  var added = [];
  var alreadyPresent = [];
  additions.forEach(function(item) {
    var key = stableStringify(item);
    if (seen.has(key)) {
      alreadyPresent.push(item);
      return;
    }
    seen.add(key);
    merged.push(item);
    added.push(item);
  });
  return { merged: merged, added: added, alreadyPresent: alreadyPresent };
}

function describeListAppend(prop, result) {
  // one #response line, e.g. "aliases: added lab:b; already there: lab:a"
  var show = function(items) {
    return items.map(function(item) {
      return typeof item === "string" ? item : JSON.stringify(item);
    }).join(", ");
  };
  var parts = [];
  if (result.added.length > 0) {
    parts.push("added " + show(result.added));
  }
  if (result.alreadyPresent.length > 0) {
    parts.push("already there: " + show(result.alreadyPresent));
  }
  return prop + ": " + parts.join("; ");
}

function getHeaderValue(headers, name) {
  // HTTP header names are case-insensitive
  var wanted = name.toLowerCase();
  var keys = Object.keys(headers || {});
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) {
      var value = headers[keys[i]];
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return null;
}

function toIfMatchValue(etag) {
  // A proxy may weaken the ETag to W/"..."; the portal reads the uuid=tid pairs
  // inside the quotes itself, so send back the strong form.
  return String(etag).replace(/^W\//, "");
}

function isLinkListProp(profile, prop) {
  var propInProfile = profile["properties"][prop];
  return !!(propInProfile && propInProfile["items"] && propInProfile["items"].hasOwnProperty("linkTo"));
}

function encodePathSegment(segment) {
  // decode first, so a segment that is already encoded isn't encoded twice
  var decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch (e) {
    // not valid percent-encoding (e.g. a bare "%"); encode it as typed
  }
  return encodeURIComponent(decoded);
}

function toLinkLookupPath(value, urlPrefixes) {
  // Portal path that finds a linked object by uuid, alias or @id path.
  // A full URL starting with one of urlPrefixes (API or UI endpoint) becomes a path.
  var text = String(value).trim();
  urlPrefixes.forEach(function(prefix) {
    if (prefix && text.indexOf(prefix + "/") === 0) {
      text = text.substring(prefix.length);
    }
  });
  if (text.charAt(0) !== "/") {
    return "/" + encodePathSegment(text) + "/";
  }
  var segments = text.split("/").filter(function(segment) { return segment !== ""; });
  return "/" + segments.map(encodePathSegment).join("/") + "/";
}

function makeAppendEditUrl(endpoint, profileName, identifier) {
  return `${endpoint}/${profileName}/${encodeURIComponent(String(identifier))}/@@edit?format=json`;
}

function makeAppendPatchUrl(endpoint, profileName, identifier) {
  return `${endpoint}/${profileName}/${encodeURIComponent(String(identifier))}`;
}

function formatResponseBody(response) {
  var text = response.getContentText();
  try {
    return JSON.stringify(JSON.parse(text), null, HELP_TEXT_INDENT);
  } catch (e) {
    return text.substring(0, 500);
  }
}

function appendFailure(status, lines) {
  return { kind: "failed", status: status, lines: lines, lists: null };
}

function collectAppendRows(sheetData, profile, listProps) {
  // One entry per visible, non-#skip row that has something to append:
  // {row, identifier, additions: {prop: [items]}, readCells, outcome}.
  // readCells keeps the identifier and list cells as read, so the row can be
  // checked again later (see markMovedRows). A row whose cells can't be used
  // gets its outcome (an error) right away.
  var header = sheetData.header;
  var skipCol = header.indexOf(HEADER_COMMENTED_PROP_SKIP);
  var usableIdentifiers = profile["identifyingProperties"].filter(function(prop) {
    return listProps.indexOf(prop) < 0;
  });
  var rows = [];
  for (var i = 0; i < sheetData.values.length; i++) {
    if (sheetData.hiddenRows[i]) {
      continue;
    }
    var rowVals = sheetData.values[i];
    if (skipCol >= 0 && toBoolean(rowVals[skipCol])) {
      continue;
    }
    var additions = {};
    var readCells = {};
    var errors = [];
    listProps.forEach(function(prop) {
      var value = rowVals[header.indexOf(prop)];
      readCells[prop] = value;
      var parsed = parseListCell(value);
      if (parsed.error) {
        errors.push(prop + ": " + parsed.error);
      } else if (parsed.items.length > 0) {
        additions[prop] = parsed.items;
      }
    });
    if (errors.length === 0 && Object.keys(additions).length === 0) {
      continue;
    }
    var ident = findIdentifyingPropValFromCache(header, rowVals, profile, listProps);
    if (ident.prop) {
      readCells[ident.prop] = rowVals[ident.col - 1];
    }
    if (errors.length === 0 && !ident.val) {
      errors.push(usableIdentifiers.length > 0
        ? "Missing a value to find the object by (" + usableIdentifiers.join(", ") + ")."
        : "Nothing to find the object by: a list you are appending to can't be used for that.");
    }
    rows.push({
      row: HEADER_ROW + 1 + i,
      identifier: ident.val,
      additions: additions,
      readCells: readCells,
      outcome: errors.length > 0 ? appendFailure("error", errors) : null,
    });
  }
  return rows;
}

function markMovedRows(sheet, rows) {
  // A row has "moved" if its identifier or list cells no longer hold what was
  // read at the start: the sheet was sorted, rows or columns were inserted or
  // deleted, or the cells were edited during the run. Such a row gets the outcome
  // "moved": nothing more is sent for it and nothing is written to it, so stale
  // data never lands in another object's row (or, on a re-run, on the portal).
  var live = rows.filter(function(row) {
    return !(row.outcome && row.outcome.kind === "moved");
  });
  if (live.length === 0) {
    return;
  }
  var colByProp = ensureHeaderColumns(sheet, []);
  var minRow = Math.min.apply(null, live.map(function(row) { return row.row; }));
  var maxRow = Math.max.apply(null, live.map(function(row) { return row.row; }));
  var columns = {};
  live.forEach(function(row) {
    Object.keys(row.readCells).forEach(function(prop) {
      if (!columns.hasOwnProperty(prop) && colByProp.hasOwnProperty(prop)) {
        columns[prop] = sheet.getRange(minRow, colByProp[prop], maxRow - minRow + 1, 1).getValues();
      }
    });
  });
  live.forEach(function(row) {
    var unchanged = Object.keys(row.readCells).every(function(prop) {
      return columns.hasOwnProperty(prop) &&
        String(columns[prop][row.row - minRow][0]) === String(row.readCells[prop]);
    });
    if (!unchanged) {
      row.outcome = { kind: "moved", status: "", lines: [], lists: null };
    }
  });
}

function groupRowsByObject(rows) {
  // Rows naming the same object become one task, so their items go out in a
  // single PATCH instead of racing each other with the same ETag.
  var tasks = [];
  var taskByIdentifier = new Map();
  rows.forEach(function(row) {
    var key = String(row.identifier);
    if (!taskByIdentifier.has(key)) {
      taskByIdentifier.set(key, { identifier: row.identifier, rows: [] });
      tasks.push(taskByIdentifier.get(key));
    }
    taskByIdentifier.get(key).rows.push(row);
  });
  return tasks;
}

function rowsWithoutOutcome(rows) {
  return rows.filter(function(row) { return !row.outcome; });
}

function readCurrentLists(response, props) {
  // Stored lists and ETag from a GET @@edit response:
  // {etag, lists: {prop: [...]}}, or {failure} when they can't be used.
  var code = response.getResponseCode();
  if (code !== 200) {
    return { failure: appendFailure("GET " + code, [formatResponseBody(response)]) };
  }
  var etag = getHeaderValue(response.getHeaders(), "ETag");
  if (!etag) {
    return { failure: appendFailure("error", [
      "The portal did not send a version stamp (ETag) for this object, so nothing was sent. " +
      "Without it, the append could overwrite someone else's change."
    ]) };
  }
  var stored;
  try {
    stored = JSON.parse(response.getContentText());
  } catch (e) {
    return { failure: appendFailure("error", ["Could not read the object from the portal: " + String(e)]) };
  }
  if (!stored || typeof stored !== "object") {
    return { failure: appendFailure("error", ["Could not read the object from the portal."]) };
  }
  var lists = {};
  for (var i = 0; i < props.length; i++) {
    var value = stored[props[i]];
    if (value === undefined || value === null) {
      lists[props[i]] = [];
    } else if (Array.isArray(value)) {
      lists[props[i]] = value;
    } else {
      return { failure: appendFailure("error", [props[i] + " on the portal is not a list."]) };
    }
  }
  return { etag: toIfMatchValue(etag), lists: lists };
}

function lookUpLinks(paths, endpoint, cache) {
  // Looks paths up in batches and caches the definite answers: the @id, or null
  // when the portal says there's no such object. Returns a Map of the paths that
  // failed for another reason (e.g. 429 or 5xx) to their HTTP code; those aren't
  // cached, so a temporary error can't make an object look missing for the run.
  var failedCodes = new Map();
  for (var start = 0; start < paths.length; start += SUBMIT_FETCH_CHUNK_SIZE) {
    var batch = paths.slice(start, start + SUBMIT_FETCH_CHUNK_SIZE);
    var responses = restGetAll(batch.map(function(path) {
      return `${endpoint}${path}?format=json&frame=object`;
    }));
    batch.forEach(function(path, i) {
      var code = responses[i].getResponseCode();
      if (code === 200) {
        var id = null;
        try {
          id = JSON.parse(responses[i].getContentText())["@id"] || null;
        } catch (e) {
          id = null;
        }
        cache.set(path, id);
      } else if (code === 403 || code === 404 || code === 410) {
        cache.set(path, null);
      } else {
        failedCodes.set(path, code);
      }
    });
  }
  return failedCodes;
}

function resolveLinkAdditions(rows, profile, endpoint, cache) {
  // For lists of links, turn each new value (uuid, alias or path) into the @id
  // path the portal stores, so the same object always compares equal. A value
  // already in the portal's list verbatim needs no lookup. Sets
  // row.additionsToMerge, or row.outcome when a value can't be resolved.
  // `cache` (see lookUpLinks) lasts the whole run.
  var urlPrefixes = [endpoint, getUIEndpoint(endpoint)];
  var needsLookup = function(row, prop, value) {
    return isLinkListProp(profile, prop) && row.current[prop].indexOf(value) < 0;
  };

  var paths = [];
  rows.forEach(function(row) {
    Object.keys(row.additions).forEach(function(prop) {
      row.additions[prop].forEach(function(value) {
        if (needsLookup(row, prop, value)) {
          var path = toLinkLookupPath(value, urlPrefixes);
          if (!cache.has(path) && paths.indexOf(path) < 0) {
            paths.push(path);
          }
        }
      });
    });
  });
  var failedCodes = lookUpLinks(paths, endpoint, cache);
  if (failedCodes.size > 0) {
    Utilities.sleep(1000);
    failedCodes = lookUpLinks(Array.from(failedCodes.keys()), endpoint, cache);
  }

  rows.forEach(function(row) {
    var notFound = [];
    var notChecked = [];
    row.additionsToMerge = {};
    Object.keys(row.additions).forEach(function(prop) {
      row.additionsToMerge[prop] = row.additions[prop].map(function(value) {
        if (!needsLookup(row, prop, value)) {
          return value;
        }
        var path = toLinkLookupPath(value, urlPrefixes);
        if (failedCodes.has(path)) {
          notChecked.push(value + " (HTTP " + failedCodes.get(path) + ")");
          return null;
        }
        var id = cache.get(path);
        if (!id) {
          notFound.push(value);
        }
        return id;
      });
    });
    var lines = [];
    if (notFound.length > 0) {
      lines.push("Not found on the portal (or not visible to you): " + notFound.join(", "));
    }
    if (notChecked.length > 0) {
      lines.push("Could not check these on the portal, so nothing was sent. Run it again: " +
        notChecked.join(", "));
    }
    if (lines.length > 0) {
      row.outcome = appendFailure("error", lines);
    }
  });
}

function runAppendAttempt(tasks, profile, profileName, endpoint, cache) {
  // One read-merge-write pass, one GET and at most one PATCH per object. Sets the
  // outcome of each task's rows, except for tasks the portal refused with 412
  // (changed since they were read), which are returned for another attempt.
  var editResponses = restGetAll(tasks.map(function(task) {
    return makeAppendEditUrl(endpoint, profileName, task.identifier);
  }));
  var readable = [];
  tasks.forEach(function(task, i) {
    var rows = rowsWithoutOutcome(task.rows);
    var props = [];
    rows.forEach(function(row) {
      Object.keys(row.additions).forEach(function(prop) {
        if (props.indexOf(prop) < 0) {
          props.push(prop);
        }
      });
    });
    var current = readCurrentLists(editResponses[i], props);
    if (current.failure) {
      rows.forEach(function(row) { row.outcome = current.failure; });
      return;
    }
    task.etag = current.etag;
    task.current = current.lists;
    rows.forEach(function(row) { row.current = current.lists; });
    readable.push(task);
  });

  var rowsToResolve = [];
  readable.forEach(function(task) {
    rowsToResolve = rowsToResolve.concat(rowsWithoutOutcome(task.rows));
  });
  resolveLinkAdditions(rowsToResolve, profile, endpoint, cache);

  var toPatch = [];
  readable.forEach(function(task) {
    var rows = rowsWithoutOutcome(task.rows);
    if (rows.length === 0) {
      return;
    }
    // The object's lists get every row's items, in row order.
    var lists = {};
    var payload = {};
    Object.keys(task.current).forEach(function(prop) {
      var additions = [];
      rows.forEach(function(row) {
        additions = additions.concat(row.additionsToMerge[prop] || []);
      });
      var merged = mergeListItems(task.current[prop], additions);
      lists[prop] = merged.merged;
      if (merged.added.length > 0) {
        payload[prop] = merged.merged;
      }
    });
    // Each row reports its own items against the portal's list before this write.
    rows.forEach(function(row) {
      row.pending = { lines: [], lists: {}, addsSomething: false };
      Object.keys(row.additionsToMerge).forEach(function(prop) {
        var own = mergeListItems(task.current[prop], row.additionsToMerge[prop]);
        row.pending.lines.push(describeListAppend(prop, own));
        row.pending.lists[prop] = lists[prop];
        if (own.added.length > 0) {
          row.pending.addsSomething = true;
        }
      });
    });
    if (Object.keys(payload).length === 0) {
      rows.forEach(function(row) {
        row.outcome = { kind: "unchanged", status: "no change", lines: row.pending.lines, lists: row.pending.lists };
      });
      return;
    }
    task.payload = payload;
    toPatch.push(task);
  });

  var patchResponses = restSubmitAll(toPatch.map(function(task) {
    return {
      url: makeAppendPatchUrl(endpoint, profileName, task.identifier),
      method: "PATCH",
      payloadJson: task.payload,
      headers: { "If-Match": task.etag },
    };
  }));
  var retry = [];
  toPatch.forEach(function(task, i) {
    var code = patchResponses[i].getResponseCode();
    if (code === 412) {
      retry.push(task);
      return;
    }
    rowsWithoutOutcome(task.rows).forEach(function(row) {
      if (code < 200 || code >= 300) {
        row.outcome = appendFailure(String(code), [formatResponseBody(patchResponses[i])]);
      } else if (row.pending.addsSomething) {
        row.outcome = { kind: "changed", status: String(code), lines: row.pending.lines, lists: row.pending.lists };
      } else {
        row.outcome = { kind: "unchanged", status: "no change", lines: row.pending.lines, lists: row.pending.lists };
      }
    });
  });
  return retry;
}

function appendCellUpdates(rows, colByProp) {
  // #response and #response_time for every row that is still in place, plus the
  // merged lists for rows that worked. Failed rows keep their cells, so they can
  // be fixed and re-run.
  var time = getCurrentLocalTimeString("");
  var updates = [];
  rows.forEach(function(row) {
    var outcome = row.outcome;
    if (outcome.kind === "moved") {
      return;
    }
    updates.push({
      row: row.row,
      col: colByProp[HEADER_COMMENTED_PROP_RESPONSE],
      value: "APPEND," + outcome.status + "\n" + outcome.lines.join("\n"),
    });
    updates.push({ row: row.row, col: colByProp[HEADER_COMMENTED_PROP_RESPONSE_TIME], value: time });
    if (outcome.lists) {
      Object.keys(outcome.lists).forEach(function(prop) {
        updates.push({ row: row.row, col: colByProp[prop], value: outcome.lists[prop] });
      });
    }
  });
  return updates;
}

function appendToListsInSheet(sheet, profileName, endpoint, listProps) {
  // Returns {total, done, changed, unchanged, failed, moved, stoppedEarly}.
  var start = Date.now();
  var profile = getProfile(profileName, endpoint);
  var rows = collectAppendRows(readSheetForSubmission(sheet), profile, listProps);
  var result = {
    total: rows.length, done: 0, changed: 0, unchanged: 0, failed: 0, moved: 0, stoppedEarly: false,
  };
  if (rows.length === 0) {
    return result;
  }
  var cache = new Map();

  for (var i = 0; i < rows.length; i += SUBMIT_FETCH_CHUNK_SIZE) {
    if (Date.now() - start > SUBMIT_TIME_BUDGET_MS) {
      // No resume needed: running it again skips what's already on the portal.
      result.stoppedEarly = true;
      break;
    }
    var chunk = rows.slice(i, i + SUBMIT_FETCH_CHUNK_SIZE);
    markMovedRows(sheet, chunk);
    var tasks = groupRowsByObject(rowsWithoutOutcome(chunk));
    for (var attempt = 1; tasks.length > 0; attempt++) {
      var retry = runAppendAttempt(tasks, profile, profileName, endpoint, cache);
      if (retry.length > 0 && attempt >= APPEND_MAX_ATTEMPTS) {
        retry.forEach(function(task) {
          rowsWithoutOutcome(task.rows).forEach(function(row) {
            row.outcome = appendFailure("412", [
              "The object kept changing while appending, so nothing was written. Run it again."
            ]);
          });
        });
        break;
      }
      tasks = retry;
    }
    markMovedRows(sheet, chunk);
    var colByProp = ensureHeaderColumns(
      sheet, [HEADER_COMMENTED_PROP_RESPONSE, HEADER_COMMENTED_PROP_RESPONSE_TIME]
    );
    writeCellUpdates(sheet, appendCellUpdates(chunk, colByProp));
    chunk.forEach(function(row) {
      result[row.outcome.kind] += 1;
    });
    result.done += chunk.length;
  }
  return result;
}
