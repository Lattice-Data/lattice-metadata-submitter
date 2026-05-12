/**
 * Extract profile type slugs from a /profiles?format=json&frame=object JSON-LD payload.
 * Walks @graph and nested objects for @id values ending in /profiles/<slug>.json
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
    var idVal = node["@id"];
    if (typeof idVal === "string") {
      var m = idVal.match(/\/profiles\/([^/?#]+)\.json$/);
      if (m) {
        slugs[m[1]] = true;
      }
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        visit(node[k]);
      }
    }
  }
  visit(root);
  return Object.keys(slugs).sort();
}
