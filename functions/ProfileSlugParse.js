/**
 * Extract profile type slugs from a /profiles?format=json&frame=object JSON payload.
 * Walks nested objects for @id or $id values ending in /profiles/<slug>.json
 */
function parseProfileSlugsFromProfilesResponse(rawText) {
  var root;
  try {
    root = typeof rawText === "string" ? JSON.parse(rawText) : rawText;
  } catch (e) {
    return [];
  }
  if (!root || typeof root !== "object") {
    return [];
  }
  var slugs = {};
  function recordProfileSlug(idVal) {
    if (typeof idVal !== "string") {
      return;
    }
    var m = idVal.match(/\/profiles\/([^/?#]+)\.json$/);
    if (m) {
      slugs[m[1]] = true;
    }
  }
  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        visit(node[i]);
      }
      return;
    }
    recordProfileSlug(node["@id"]);
    recordProfileSlug(node["$id"]);
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        visit(node[k]);
      }
    }
  }
  visit(root);
  return Object.keys(slugs).sort();
}
