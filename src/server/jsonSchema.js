const AjvDraft04 = require('ajv-draft-04');
const AjvDraft202012 = require('ajv/dist/2020');

global.validateJson = (schema, data) => {
  // Pick validator by schema $schema URI (Lattice uses 2020-12; draft-04 still supported for older payloads)
  const ajv =
    schema.$schema === 'http://json-schema.org/draft-04/schema#'
      ? new AjvDraft04({ strict: false })
      : new AjvDraft202012({ strict: false });

  const valid = ajv.validate(schema, data);
  return { valid, errors: ajv.errors };
};
