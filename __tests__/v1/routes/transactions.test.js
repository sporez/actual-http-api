// Ensure required secrets exist before importing modules that load config at module initialization
process.env.API_KEY = process.env.API_KEY || 'test-api-key';
process.env.ACTUAL_SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD || 'test-password';

describe('Transactions Routes', () => {
  let mockRouter;
  let mockBudget;
  let mockReq;
  let mockRes;
  let mockNext;
  let handlers;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.clearAllMocks();

    handlers = {};

    mockRouter = {
      get: jest.fn((path, handler) => {
        handlers[`GET ${path}`] = handler;
      }),
      post: jest.fn((path, handler) => {
        handlers[`POST ${path}`] = handler;
      }),
      patch: jest.fn((path, handler) => {
        handlers[`PATCH ${path}`] = handler;
      }),
      delete: jest.fn((path, handler) => {
        handlers[`DELETE ${path}`] = handler;
      }),
    };

    mockBudget = {
      getAccount: jest.fn().mockResolvedValue({
        id: 'acc1',
        name: 'Checking',
      }),
      getTransactions: jest.fn().mockResolvedValue([
        {
          id: 'txn1',
          account: 'acc1',
          date: '2023-08-01',
          amount: -50,
          payee: 'Store',
          cleared: true,
        },
        {
          id: 'txn2',
          account: 'acc1',
          date: '2023-08-02',
          amount: -75,
          payee: 'Gas Station',
          cleared: false,
        },
      ]),
      searchTransactions: jest.fn().mockResolvedValue([
        {
          id: 'txn-search',
          account: 'acc1',
          date: '2023-08-03',
          amount: -1250,
          payee: 'Target',
          cleared: true,
        },
      ]),
      addTransaction: jest.fn().mockResolvedValue('ok'),
      addTransactions: jest.fn().mockResolvedValue('ok'),
      batchUpdateTransactions: jest.fn().mockResolvedValue({
        added: ['txn-new'],
        updated: [],
        deleted: [],
      }),
      importTransactions: jest.fn().mockResolvedValue({
        imported: 2,
      }),
      updateTransaction: jest.fn().mockResolvedValue({
        id: 'txn1',
        amount: -100,
      }),
      deleteTransaction: jest.fn().mockResolvedValue(undefined),
      deleteTransactions: jest.fn().mockResolvedValue(undefined),
    };

    mockReq = {
      params: {},
      query: {},
      body: {},
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      locals: {
        budget: mockBudget,
      },
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.dontMock('../../../src/config/config');
    delete process.env.EXPERIMENTAL_OPERATIONS_ENABLED;
  });

  describe('GET /budgets/:budgetSyncId/accounts/:accountId/transactions', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.get).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/accounts/:accountId/transactions',
        expect.any(Function)
      );
    });

    it('should return transactions list for an account', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.since_date = '2023-08-01';

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getAccount).toHaveBeenCalledWith('acc1');
      expect(mockBudget.getTransactions).toHaveBeenCalledWith('acc1', '2023-08-01', undefined);
      expect(mockRes.json).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'txn1' }),
        ]),
      });
    });

    it('should return transactions with date range', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.since_date = '2023-08-01';
      mockReq.query.until_date = '2023-08-31';

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getTransactions).toHaveBeenCalledWith('acc1', '2023-08-01', '2023-08-31');
    });

    it('should reject without since_date', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject for nonexistent account', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'nonexistent';
      mockReq.query.since_date = '2023-08-01';
      mockBudget.getAccount.mockResolvedValueOnce(null);

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should support pagination with page and limit', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.since_date = '2023-08-01';
      mockReq.query.page = '1';
      mockReq.query.limit = '10';
      mockBudget.getTransactions.mockResolvedValueOnce(
        Array(15).fill(null).map((_, i) => ({
          id: `txn${i}`,
          account: 'acc1',
          date: '2023-08-01',
          amount: -50,
        }))
      );

      await handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalled();
      const data = mockRes.json.mock.calls[0][0].data;
      expect(data).toHaveLength(10);
    });

    it('should reject pagination with only page', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.since_date = '2023-08-01';
      mockReq.query.page = '1';

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle errors from getTransactions', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.since_date = '2023-08-01';
      const error = new Error('Database error');
      mockBudget.getTransactions.mockRejectedValueOnce(error);

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('GET /budgets/:budgetSyncId/accounts/:accountId/transactions/search', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.get).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/accounts/:accountId/transactions/search',
        expect.any(Function)
      );
    });

    it('should search transactions for an account', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions/search'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.q = ' target ';
      mockReq.query.limit = '25';
      mockReq.query.offset = '50';

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getAccount).toHaveBeenCalledWith('acc1');
      expect(mockBudget.searchTransactions).toHaveBeenCalledWith('acc1', 'target', {
        limit: 25,
        offset: 50,
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        data: [expect.objectContaining({ id: 'txn-search' })],
      });
    });

    it('should default search paging options', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions/search'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.q = 'target';

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.searchTransactions).toHaveBeenCalledWith('acc1', 'target', {
        limit: 50,
        offset: 0,
      });
    });

    it('should reject without q', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions/search'];
      mockReq.params.accountId = 'acc1';

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.searchTransactions).not.toHaveBeenCalled();
    });

    it('should reject invalid search paging options', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['GET /budgets/:budgetSyncId/accounts/:accountId/transactions/search'];
      mockReq.params.accountId = 'acc1';
      mockReq.query.q = 'target';
      mockReq.query.limit = '0';

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.searchTransactions).not.toHaveBeenCalled();
    });
  });

  describe('POST /budgets/:budgetSyncId/accounts/:accountId/transactions', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.post).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/accounts/:accountId/transactions',
        expect.any(Function)
      );
    });

    it('should create a transaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -50,
          payee_name: 'Store',
          account: 'acc1',
        },
        learnCategories: false,
        runTransfers: false,
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getAccount).toHaveBeenCalledWith('acc1');
      expect(mockBudget.addTransaction).toHaveBeenCalledWith('acc1', mockReq.body.transaction, {
        learnCategories: false,
        runTransfers: false,
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'ok',
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should set default values for learnCategories and runTransfers', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -50,
          account: 'acc1',
        },
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.addTransaction).toHaveBeenCalledWith('acc1', mockReq.body.transaction, {
        learnCategories: false,
        runTransfers: false,
      });
    });


    it('should create a split transaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -7500,
          account: 'acc1',
          subtransactions: [
            { amount: -5000, category: 'cat-food' },
            { amount: -2500, category: 'cat-home' },
          ],
        },
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.addTransaction).toHaveBeenCalledWith('acc1', mockReq.body.transaction, {
        learnCategories: false,
        runTransfers: false,
      });
    });

    it('should reject split transaction child amount mismatch', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -7500,
          account: 'acc1',
          subtransactions: [
            { amount: -5000, category: 'cat-food' },
            { amount: -2400, category: 'cat-home' },
          ],
        },
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject without transaction property', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {};

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject with empty transaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {},
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject for nonexistent account', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'nonexistent';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -50,
          account: 'nonexistent',
        },
      };
      mockBudget.getAccount.mockResolvedValueOnce(null);

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('POST /budgets/:budgetSyncId/accounts/:accountId/transactions/batch', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.post).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/accounts/:accountId/transactions/batch',
        expect.any(Function)
      );
    });

    it('should create multiple transactions', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/batch'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transactions: [
          {
            date: '2023-08-01',
            amount: -50,
            payee_name: 'Store',
            account: 'acc1',
          },
          {
            date: '2023-08-02',
            amount: -75,
            payee_name: 'Gas',
            account: 'acc1',
          },
        ],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getAccount).toHaveBeenCalledWith('acc1');
      expect(mockBudget.addTransactions).toHaveBeenCalledWith('acc1', mockReq.body.transactions, expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'ok',
      });
    });

    it('should reject without transactions array', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/batch'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {};

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject with empty transactions array', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/batch'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transactions: [],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('POST /budgets/:budgetSyncId/accounts/:accountId/transactions/import', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.post).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/accounts/:accountId/transactions/import',
        expect.any(Function)
      );
    });

    it('should import transactions', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/import'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transactions: [
          {
            date: '2023-08-01',
            amount: -50,
            imported_id: 'ext-1',
            account: 'acc1',
          },
        ],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.getAccount).toHaveBeenCalledWith('acc1');
      expect(mockBudget.importTransactions).toHaveBeenCalledWith('acc1', mockReq.body.transactions, {
        defaultCleared: true,
        dryRun: false,
        reimportDeleted: false,
      });
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should import transactions with explicit options', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/import'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transactions: [
          {
            date: '2023-08-01',
            amount: -50,
            imported_id: 'ext-1',
            account: 'acc1',
          },
        ],
        defaultCleared: false,
        dryRun: true,
        reimportDeleted: true,
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.importTransactions).toHaveBeenCalledWith('acc1', mockReq.body.transactions, {
        defaultCleared: false,
        dryRun: true,
        reimportDeleted: true,
      });
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should reject without transactions array', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions/import'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {};

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('POST /budgets/:budgetSyncId/transactions/batch-update', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.post).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/transactions/batch-update',
        expect.any(Function)
      );
    });

    it('should forward transaction changes and options', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -1299,
          payee: 'payee1',
          category: 'cat-final',
        }],
        updated: [{ id: 'txn-existing', notes: 'Updated' }],
        deleted: [{ id: 'txn-delete' }],
        learnCategories: true,
        runTransfers: true,
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.batchUpdateTransactions).toHaveBeenCalledWith(mockReq.body);
      expect(mockRes.json).toHaveBeenCalledWith({
        data: {
          added: ['txn-new'],
          updated: [],
          deleted: [],
        },
      });
    });

    it('should default missing arrays and options conservatively', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -1299,
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.batchUpdateTransactions).toHaveBeenCalledWith({
        added: mockReq.body.added,
        updated: [],
        deleted: [],
        learnCategories: false,
        runTransfers: false,
      });
    });

    it('should reject an empty diff', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [],
        updated: [],
        deleted: [],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.batchUpdateTransactions).not.toHaveBeenCalled();
    });

    it('should reject added transactions without required fields', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          amount: -1299,
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.batchUpdateTransactions).not.toHaveBeenCalled();
    });

    it('should forward split transaction changes', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -7500,
          subtransactions: [
            { amount: -5000, category: 'cat-food' },
            { amount: -2500, category: 'cat-home' },
          ],
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.batchUpdateTransactions).toHaveBeenCalledWith({
        added: mockReq.body.added,
        updated: [],
        deleted: [],
        learnCategories: false,
        runTransfers: false,
      });
    });

    it('should reject nested split transactions', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -7500,
          subtransactions: [
            {
              amount: -7500,
              category: 'cat-food',
              subtransactions: [{ amount: -7500, category: 'cat-nested' }],
            },
          ],
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.batchUpdateTransactions).not.toHaveBeenCalled();
    });

    it('should reject non-integer split child amounts', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -7500,
          subtransactions: [
            { amount: -5000.5, category: 'cat-food' },
            { amount: -2499.5, category: 'cat-home' },
          ],
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockBudget.batchUpdateTransactions).not.toHaveBeenCalled();
    });

    it('should return 501 when experimental operations are disabled', async () => {
      jest.doMock('../../../src/config/config', () => ({
        config: {
          experimentalOperationsEnabled: false,
        },
      }));
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -1299,
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'This operation is experimental and is currently disabled.',
      });
      expect(mockBudget.batchUpdateTransactions).not.toHaveBeenCalled();
    });

    it('should pass batchUpdateTransactions errors to next', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/transactions/batch-update'];
      const error = new Error('Batch update failed');
      mockBudget.batchUpdateTransactions.mockRejectedValueOnce(error);
      mockReq.body = {
        added: [{
          id: 'txn-new',
          account: 'acc1',
          date: '2026-06-14',
          amount: -1299,
        }],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('PATCH /budgets/:budgetSyncId/transactions/:transactionId', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.patch).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/transactions/:transactionId',
        expect.any(Function)
      );
    });

    it('should update a transaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['PATCH /budgets/:budgetSyncId/transactions/:transactionId'];
      mockReq.params.transactionId = 'txn1';
      mockReq.body = {
        transaction: {
          account: 'acc1',
          date: '2023-08-01',
          amount: -100,
          notes: 'Updated note',
        },
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.updateTransaction).toHaveBeenCalledWith('txn1', mockReq.body.transaction);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transaction updated',
      });
    });

    it('should reject without transaction property', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['PATCH /budgets/:budgetSyncId/transactions/:transactionId'];
      mockReq.params.transactionId = 'txn1';
      mockReq.body = {};

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('DELETE /budgets/:budgetSyncId/transactions/:transactionId', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/transactions/:transactionId',
        expect.any(Function)
      );
    });

    it('should delete a transaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['DELETE /budgets/:budgetSyncId/transactions/:transactionId'];
      mockReq.params.transactionId = 'txn1';

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.deleteTransaction).toHaveBeenCalledWith('txn1');
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transaction deleted',
      });
    });
  });

  describe('DELETE /budgets/:budgetSyncId/transactions/batch', () => {
    it('should register the route', () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/budgets/:budgetSyncId/transactions/batch',
        expect.any(Function)
      );
    });

    it('should delete multiple transactions', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['DELETE /budgets/:budgetSyncId/transactions/batch'];
      mockReq.body = {
        transactionIds: ['txn1', 'txn2'],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.deleteTransactions).toHaveBeenCalledWith(['txn1', 'txn2']);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transactions deleted',
      });
    });

    it('should handle missing transactionIds (defaults to empty array)', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['DELETE /budgets/:budgetSyncId/transactions/batch'];
      mockReq.body = {};

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.deleteTransactions).toHaveBeenCalledWith([]);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transactions deleted',
      });
    });

    it('should handle empty transactionIds array', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['DELETE /budgets/:budgetSyncId/transactions/batch'];
      mockReq.body = {
        transactionIds: [],
      };

      await handler(mockReq, mockRes, mockNext);

      expect(mockBudget.deleteTransactions).toHaveBeenCalledWith([]);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Transactions deleted',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors from addTransaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['POST /budgets/:budgetSyncId/accounts/:accountId/transactions'];
      mockReq.params.accountId = 'acc1';
      mockReq.body = {
        transaction: {
          date: '2023-08-01',
          amount: -50,
          account: 'acc1',
        },
      };
      const error = new Error('Invalid transaction');
      mockBudget.addTransaction.mockRejectedValueOnce(error);

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle errors from updateTransaction', async () => {
      const transactionsModule = require('../../../src/v1/routes/transactions');
      transactionsModule(mockRouter);

      const handler = handlers['PATCH /budgets/:budgetSyncId/transactions/:transactionId'];
      mockReq.params.transactionId = 'txn1';
      mockReq.body = {
        transaction: { amount: -100 },
      };
      const error = new Error('Transaction not found');
      mockBudget.updateTransaction.mockRejectedValueOnce(error);

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
