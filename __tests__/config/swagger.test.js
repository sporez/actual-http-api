const SwaggerParser = require('@apidevtools/swagger-parser');

describe('Swagger specification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      API_KEY: 'test-api-key',
      ACTUAL_SERVER_PASSWORD: 'test-password',
    };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generates a valid OpenAPI document', async () => {
    const { openapiSpecification } = require('../../src/config/swagger');

    await expect(SwaggerParser.validate(openapiSpecification)).resolves.toBeDefined();
  });

  it('documents Actualist extension endpoints', () => {
    const { openapiSpecification } = require('../../src/config/swagger');

    expect(openapiSpecification.paths).toEqual(expect.objectContaining({
      '/budgets/{budgetSyncId}/months/{month}/alerts': expect.any(Object),
      '/budgets/{budgetSyncId}/months/{month}/transactions/uncategorized': expect.any(Object),
      '/budgets/{budgetSyncId}/months/{month}/templates/apply': expect.any(Object),
      '/budgets/{budgetSyncId}/accounts/{accountId}/reconcile': expect.any(Object),
      '/budgets/{budgetSyncId}/accounts/{accountId}/transactions/search': expect.any(Object),
      '/budgets/{budgetSyncId}/transactions': expect.any(Object),
      '/budgets/{budgetSyncId}/transactions/search': expect.any(Object),
      '/budgets/{budgetSyncId}/rules/run': expect.any(Object),
      '/budgets/{budgetSyncId}/transactions/batch-update': expect.any(Object),
    }));
    expect(openapiSpecification.components.schemas.Account.properties.bankSyncLinked).toEqual(
      expect.objectContaining({ type: 'boolean' })
    );
  });

  it('hides experimental endpoints when experimental operations are disabled', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      EXPERIMENTAL_OPERATIONS_ENABLED: 'false',
    };
    jest.resetModules();

    const { openapiSpecification } = require('../../src/config/swagger');

    expect(openapiSpecification.paths['/budgets/{budgetSyncId}/rules/run']).toBeUndefined();
    expect(openapiSpecification.paths['/budgets/{budgetSyncId}/transactions/batch-update']).toBeUndefined();
    expect(openapiSpecification.paths['/budgets/{budgetSyncId}/months/{month}/templates/apply']).toBeDefined();
  });
});
