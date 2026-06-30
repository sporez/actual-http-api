
function requestContext(req) {
  if (!req) return undefined;
  return {
    method: req.method,
    path: req.originalUrl || req.url,
  };
}

function errorResponse(message, code, details) {
  return Object.assign(
    { error: message },
    code ? { code } : {},
    details ? { details } : {}
  );
}

function clientError(req, res, status, error, message) {
  console.log(message, { request: requestContext(req) }, error);
  res.status(status).json(errorResponse(message));
}

function serverError(req, res, status, error, message, code, details) {
  console.error(message, {
    code,
    details,
    request: requestContext(req),
  }, error);
  res.status(status).json(errorResponse(message, code, details));
}

function isPostError(err, reason) {
  const message = err && err.message ? err.message : '';
  return err && err.type == 'PostError'
    && (err.reason == reason || message.includes(reason));
}

function isActualBudgetAccessError(err) {
  return err && err.actualHttpApi && err.actualHttpApi.code == 'ACTUAL_BUDGET_ACCESS_FAILED';
}

const errorHandler = (err, req, res, next) => {
  const message = err && err.message ? err.message : '';

  if (isPostError(err, 'unauthorized')) {
    serverError(
      req,
      res,
      502,
      err,
      'Actual Server rejected the sync request as unauthorized',
      'ACTUAL_SYNC_UNAUTHORIZED',
      'Verify ACTUAL_SERVER_PASSWORD and restart actual-http-api to refresh the Actual API session.'
    );
  } else if (isActualBudgetAccessError(err)) {
    serverError(
      req,
      res,
      502,
      err,
      'Actual Server budget access failed',
      err.actualHttpApi.code,
      `Failed while trying to ${err.actualHttpApi.operation}. Check actual-http-api logs for the upstream Actual error.`
    );
  } else if (err.type == 'PostError'
    && (message.includes('Not Allowed')
      || message.includes('network-failure'))) {
    serverError(req, res, 502, err, 'Error accessing Actual Server, check Actual Server url', 'ACTUAL_SERVER_UNREACHABLE');
  } else if (message.includes('Could not get remote files')) {
    serverError(req, res, 502, err, 'Error accessing Actual Server, check Actual Server password', 'ACTUAL_SERVER_AUTH_FAILED');
  } else if (message.includes('not found')
    || message.includes('Not found')
    || message.includes('No budget')
    || message.includes('Cannot destructure property')) {
    clientError(req, res, 404, err, message);
  } else if (message.includes('Invalid month')
    || message.includes('required')
    || message.includes('Bad date format')
    || message.includes('does not exist on table')
    || message.includes('convert to integer')
    || message.includes('must be')
  ) {
    clientError(req, res, 400, err, message);
  } else {
    serverError(req, res, 500, err, 'Unknown error while interacting with Actual Api. See server logs for more information', 'ACTUAL_API_UNKNOWN_ERROR');
  }
}

exports.errorHandler = errorHandler;
