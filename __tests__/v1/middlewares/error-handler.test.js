const { errorHandler } = require('../../../src/v1/middlewares/error-handler');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      originalUrl: '/v1/budgets/test-budget/accounts',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('errorHandler', () => {
    it('should return 502 for PostError with network-failure', () => {
      const err = new Error('network-failure');
      err.type = 'PostError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Error accessing Actual Server, check Actual Server url',
        code: 'ACTUAL_SERVER_UNREACHABLE',
      });
    });

    it('should return 502 for PostError with Not Allowed', () => {
      const err = new Error('Not Allowed');
      err.type = 'PostError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Error accessing Actual Server, check Actual Server url',
        code: 'ACTUAL_SERVER_UNREACHABLE',
      });
    });

    it('should return 502 for PostError with unauthorized', () => {
      const err = new Error('unauthorized');
      err.type = 'PostError';
      err.reason = 'unauthorized';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Actual Server rejected the sync request as unauthorized',
        code: 'ACTUAL_SYNC_UNAUTHORIZED',
        details: 'Verify ACTUAL_SERVER_PASSWORD and restart actual-http-api to refresh the Actual API session.',
      });
    });

    it('should return 502 for budget access errors', () => {
      const err = new Error('Actual budget sync budget failed');
      err.actualHttpApi = {
        code: 'ACTUAL_BUDGET_ACCESS_FAILED',
        operation: 'sync budget',
      };

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Actual Server budget access failed',
        code: 'ACTUAL_BUDGET_ACCESS_FAILED',
        details: 'Failed while trying to sync budget. Check actual-http-api logs for the upstream Actual error.',
      });
    });

    it('should log request context for server errors', () => {
      const err = new Error('Some unknown error');

      errorHandler(err, req, res, next);

      expect(console.error).toHaveBeenCalledWith(
        'Unknown error while interacting with Actual Api. See server logs for more information',
        {
          code: 'ACTUAL_API_UNKNOWN_ERROR',
          details: undefined,
          request: {
            method: 'GET',
            path: '/v1/budgets/test-budget/accounts',
          },
        },
        err
      );
    });

    it('should return 502 for remote files error', () => {
      const err = new Error('Could not get remote files');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Error accessing Actual Server, check Actual Server password',
        code: 'ACTUAL_SERVER_AUTH_FAILED',
      });
    });

    it('should return 404 for not found errors', () => {
      const err = new Error('not found');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'not found' });
    });

    it('should return 404 for No budget errors', () => {
      const err = new Error('No budget');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'No budget' });
    });

    it('should return 404 for destructure errors', () => {
      const err = new Error('Cannot destructure property');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot destructure property' });
    });

    it('should return 400 for Invalid month errors', () => {
      const err = new Error('Invalid month');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid month' });
    });

    it('should return 400 for required field errors', () => {
      const err = new Error('Field required');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Field required' });
    });

    it('should return 400 for Bad date format errors', () => {
      const err = new Error('Bad date format');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bad date format' });
    });

    it('should return 400 for does not exist on table errors', () => {
      const err = new Error('does not exist on table');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'does not exist on table' });
    });

    it('should return 400 for convert to integer errors', () => {
      const err = new Error('convert to integer');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'convert to integer' });
    });

    it('should return 400 for must be errors', () => {
      const err = new Error('Value must be positive');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Value must be positive' });
    });

    it('should return 500 for unknown errors', () => {
      const err = new Error('Some unknown error');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unknown error while interacting with Actual Api. See server logs for more information',
        code: 'ACTUAL_API_UNKNOWN_ERROR',
      });
    });
  });
});
