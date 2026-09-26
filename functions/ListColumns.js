/*
Long lists across several columns.

A Google Sheets cell holds at most 50,000 characters, which as a JSON list is
about 1,300 uuids or 900 @id paths. A list property can therefore continue in
further columns: `derived_from` holds the first part and `derived_from#2`,
`derived_from#3`, ... hold the rest, each an ordinary JSON list.

Reading a row (Validate, POST, PATCH, PUT, Export, append) joins the parts in
order into one list, see rowDataToJson. Writing a row (GET, the write-back after
POST or append) splits a list that would not fit into as many parts as needed,
adds the header columns it lacks, and blanks parts that are no longer needed,
see spreadListValues. Any list property works this way, and a sheet without
continuation columns behaves as before.
*/

// Sheets refuses more than 50,000 characters in a cell; keep some headroom.
const LIST_CELL_MAX_CHARS = 40000;
// "derived_from#2": a property name, "#", and the part number.
const CONTINUATION_HEADER_REGEX = /^([^#\s]+)#([0-9]+)$/;


function parseContinuationHeader(header) {
  // "derived_from#2" -> {base: "derived_from", part: 2}; null for any other
  // header. The base column is part 1, so "#1" is not a continuation.
  if (typeof header !== "string") {
    return null;
  }
  var match = CONTINUATION_HEADER_REGEX.exec(header.trim());
  if (!match) {
    return null;
  }
  var part = parseInt(match[2], 10);
  if (part < 2) {
    return null;
  }
  return { base: match[1], part: part };
}

function continuationHeader(prop, part) {
  return prop + "#" + part;
}

function baseHeaderProp(header) {
  // The property a column holds: "derived_from#2" -> "derived_from".
  var parsed = parseContinuationHeader(header);
  return parsed ? parsed.base : header;
}

function isContinuationOfListProp(profile, header) {
  var parsed = parseContinuationHeader(header);
  return !!parsed && isArrayProp(profile, parsed.base);
}

function selectedBaseProps(selectedCols) {
  // The properties behind selected columns ({col, headerProp}), each once.
  // Selecting any part of a list selects the whole list.
  var props = [];
  selectedCols.forEach(function(selected) {
    var prop = baseHeaderProp(selected.headerProp);
    if (props.indexOf(prop) < 0) {
      props.push(prop);
    }
  });
  return props;
}

function listColumnHeaders(header, prop) {
  // The header names holding `prop`, in part order and only those present,
  // e.g. ["derived_from", "derived_from#2", "derived_from#3"].
  var found = [];
  header.forEach(function(name) {
    if (name === prop) {
      found.push({ name: name, part: 1 });
      return;
    }
    var parsed = parseContinuationHeader(name);
    if (parsed && parsed.base === prop) {
      found.push({ name: name, part: parsed.part });
    }
  });
  found.sort(function(a, b) { return a.part - b.part; });
  return found.map(function(entry) { return entry.name; });
}

function describePropsWithColumns(props, header) {
  // "derived_from (3 columns), description", for confirmation dialogs.
  return props.map(function(prop) {
    var columns = listColumnHeaders(header, prop);
    return columns.length > 1 ? prop + " (" + columns.length + " columns)" : prop;
  }).join(", ");
}

function joinListParts(prop, parts) {
  // parts: [{header, value}] in part order, values as parsed from the cells,
  // empty cells left out. Returns one list; throws when a part isn't a list,
  // naming the cell's column.
  var items = [];
  parts.forEach(function(part) {
    if (!Array.isArray(part.value)) {
      throw new Error(
        part.header + ' must be a JSON list such as ["item1", "item2"] because ' + prop +
        " continues over several columns; got: " + String(part.value).substring(0, 200)
      );
    }
    items = items.concat(part.value);
  });
  return items;
}

function splitListForCells(list, maxChars) {
  // JSON strings for `list` in parts that each fit in maxChars, in order: items
  // are never split, so an item longer than maxChars gets a part of its own.
  // An empty list is one part, "[]".
  var limit = maxChars || LIST_CELL_MAX_CHARS;
  var parts = [];
  var current = [];
  var length = 2; // the brackets
  list.forEach(function(item) {
    var itemJson = JSON.stringify(item);
    var itemLength = itemJson === undefined ? 4 : itemJson.length; // undefined is written as null
    var separator = current.length > 0 ? 1 : 0;
    if (current.length > 0 && length + separator + itemLength > limit) {
      parts.push(current);
      current = [];
      length = 2;
      separator = 0;
    }
    current.push(item);
    length += separator + itemLength;
  });
  parts.push(current);
  return parts.map(function(part) { return JSON.stringify(part); });
}

function spreadListValues(json, header) {
  // Cell values by header name for every property in `json`. A list too long for
  // one cell becomes `prop`, `prop#2`, ... Continuation columns in `header` that
  // belong to a property in `json` but get no part are set to "", so a shorter
  // list never leaves stale parts behind.
  var cells = {};
  Object.keys(json).forEach(function(prop) {
    var value = json[prop];
    var parts = Array.isArray(value)
      ? splitListForCells(value, LIST_CELL_MAX_CHARS)
      : [toCellValue(value)];
    parts.forEach(function(part, i) {
      cells[i === 0 ? prop : continuationHeader(prop, i + 1)] = part;
    });
  });
  header.forEach(function(name) {
    var parsed = parseContinuationHeader(name);
    if (parsed && json.hasOwnProperty(parsed.base) && !cells.hasOwnProperty(name)) {
      cells[name] = "";
    }
  });
  return cells;
}

function makeTooltipForContinuation(continuation) {
  return "Part " + continuation.part + " of " + continuation.base + ".\n" +
    "A list too long for one cell continues here as another JSON list. " +
    "The parts are joined in order when a row is read, and filled in when a row is written.";
}
