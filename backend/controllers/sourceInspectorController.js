import {
  discoverSource,
  readSource,
  searchSource,
} from "../services/sourceInspectorService.js";

function publicError(error) {
  const status = Number(error?.statusCode);
  if (!status || status >= 500) {
    return { status: 500, body: { error: "Source inspector failed." } };
  }
  return {
    status,
    body: { error: String(error.message || "Request rejected.") },
  };
}

function plainBody(body) {
  if (body == null) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Request body must be an object.");
    error.statusCode = 400;
    throw error;
  }
  return body;
}

function run(action, res) {
  try {
    res.json(action());
  } catch (error) {
    const result = publicError(error);
    res.status(result.status).json(result.body);
  }
}

export function createSourceInspectorHandlers({
  discover = discoverSource,
  read = readSource,
  search = searchSource,
} = {}) {
  return {
    discoverHandler(req, res) {
      const body = plainBody(req.body);
      run(() => discover({ dir: body.dir, limit: body.limit }), res);
    },
    readHandler(req, res) {
      const body = plainBody(req.body);
      run(() => read({
        path: body.path,
        startLine: body.startLine,
        endLine: body.endLine,
      }), res);
    },
    searchHandler(req, res) {
      const body = plainBody(req.body);
      run(() => search({ query: body.query, dir: body.dir, limit: body.limit }), res);
    },
  };
}
