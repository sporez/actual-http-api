# Transaction Editor Endpoint Plan

## Goal

Add a small, conservative set of HTTP endpoints that let non-Node clients implement the same transaction editor flow as the Actual app:

1. Run Actual rules against a draft transaction when the payee or other relevant field changes.
2. Let the user override any suggested fields.
3. Commit the final transaction exactly as submitted.
4. Leave balances, category state, transfers, and budget totals to Actual, then let clients refetch.

This should avoid app-side rule reimplementation and avoid a create-then-patch workaround.

## Background

The current create endpoint:

```text
POST /budgets/{budgetSyncId}/accounts/{accountId}/transactions
```

routes through `budget.addTransaction(...)`, which calls `actualApi.addTransactions(...)`. In practice, this path can apply rule behavior during creation, so an explicitly selected category may be overwritten by the rule/default category.

Actual's own app uses a different editor pattern:

- While editing a new transaction, it calls `rules-run` and applies returned fields as draft suggestions.
- On save, it sends final changes through `transactions-batch-update`.
- The server inserts the final transaction values directly, with later Actual post-processing for transfers/category learning as configured.

The fork should expose that app-parity behavior through HTTP, while keeping the existing public endpoints intact.

## Proposed Endpoints

### 1. Run Rules Against A Draft

```text
POST /budgets/{budgetSyncId}/rules/run
```

Request:

```json
{
  "transaction": {
    "id": "temporary-id-or-client-id",
    "account": "account-id",
    "date": "2026-06-14",
    "amount": -1299,
    "payee": "payee-id",
    "category": null,
    "notes": null,
    "cleared": false
  }
}
```

Response:

```json
{
  "data": {
    "id": "temporary-id-or-client-id",
    "account": "account-id",
    "date": "2026-06-14",
    "amount": -1299,
    "payee": "payee-id",
    "category": "suggested-category-id",
    "notes": null,
    "cleared": false
  }
}
```

Behavior:

- Delegate to Actual's own `rules-run` behavior.
- Do not persist anything.
- Return the transaction after rules are applied.
- Preserve any Actual `_ruleErrors` or formula error metadata if Actual returns it.
- Keep this endpoint behind `EXPERIMENTAL_OPERATIONS_ENABLED`.

Client expectation:

- The client decides how to merge suggestions into its draft.
- For Actualist, apply suggestions to empty fields, and when the updated field is payee, allow rules to replace draft fields the same way Actual does.
- After the user manually changes a field, later rule previews should not silently overwrite that manual value unless the triggering behavior intentionally matches Actual.

### 2. Commit Final Transaction Changes

```text
POST /budgets/{budgetSyncId}/transactions/batch-update
```

Request:

```json
{
  "added": [
    {
      "id": "client-generated-transaction-id",
      "account": "account-id",
      "date": "2026-06-14",
      "amount": -1299,
      "payee": "payee-id",
      "category": "final-category-id",
      "notes": "optional note",
      "cleared": false
    }
  ],
  "updated": [],
  "deleted": [],
  "learnCategories": false,
  "runTransfers": false
}
```

Response:

```json
{
  "data": {
    "added": [],
    "updated": [],
    "deleted": []
  }
}
```

Behavior:

- Delegate to Actual's `transactions-batch-update` behavior.
- Accept `added`, `updated`, and `deleted` arrays, defaulting missing arrays to empty arrays.
- Default `learnCategories` to `false`.
- Default `runTransfers` to `false` for Actualist's initial simple transaction-creation flow.
- Consider exposing `detectOrphanPayees` only if Actual's handler supports it cleanly and tests demonstrate the default behavior.
- Do not run transaction rules during this commit endpoint.
- Do not calculate balances, budget totals, or transaction rows in this wrapper.
- Keep this endpoint behind `EXPERIMENTAL_OPERATIONS_ENABLED`.

Client expectation:

- Actualist will initially use only `added` with one transaction.
- Actualist will refetch account balance, account transactions, and the affected budget month after success.
- Actualist should treat errors from this endpoint as failed writes and keep the editor open.

## Implementation Shape

### Routes

Add route handlers in:

```text
src/v1/routes/rules.js
src/v1/routes/transactions.js
```

Suggested route names:

```text
POST /budgets/:budgetSyncId/rules/run
POST /budgets/:budgetSyncId/transactions/batch-update
```

Both handlers should:

- Validate request bodies.
- Check `config.experimentalOperationsEnabled`.
- Return `501` with `EXPERIMENTAL_DISABLED_MESSAGE` when disabled.
- Forward errors to the existing error middleware.
- Include Swagger docs marked as unofficial/experimental.

### Budget Facade

Add methods in:

```text
src/v1/budget.js
```

Suggested names:

```js
async function runRules(transaction) {}
async function batchUpdateTransactions({ added, updated, deleted, learnCategories, runTransfers }) {}
```

Important spike:

- Verify the best supported way to call Actual internals from the installed `@actual-app/api` package.
- Prefer an exported public method if one exists.
- If no public method exists, keep the internal call isolated to `budget.js`, document the import/path, and cover it with tests.
- Do not let route files reach directly into Actual internals.

### Validation

For `rules/run`:

- Require `transaction`.
- Require basic transaction object shape.
- Do not require `category`.
- Do not require existing payee when `payee_name` or custom payee behavior is supported by the caller's draft.

For `transactions/batch-update`:

- Require at least one non-empty `added`, `updated`, or `deleted` array.
- Validate arrays when present.
- For `added` transactions, require `id`, `account`, `date`, and integer `amount`.
- Keep `category` optional.
- Avoid over-validating fields Actual supports but this wrapper does not currently understand.

## Tests

### Route Tests

Add coverage in:

```text
__tests__/v1/routes/rules.test.js
__tests__/v1/routes/transactions.test.js
```

Cases:

- `rules/run` forwards the draft transaction to `budget.runRules`.
- `rules/run` returns the ruled transaction without persisting.
- `rules/run` rejects missing transaction.
- `rules/run` returns `501` when experimental operations are disabled.
- `transactions/batch-update` forwards `added`, `updated`, `deleted`, `learnCategories`, and `runTransfers`.
- `transactions/batch-update` defaults missing arrays/options conservatively.
- `transactions/batch-update` rejects an empty diff.
- `transactions/batch-update` returns `501` when experimental operations are disabled.
- Errors are passed to `next`.

### Budget Facade Tests

Add coverage in:

```text
__tests__/v1/budget.test.js
```

Cases:

- `runRules` delegates to Actual's rule runner and returns the result.
- `batchUpdateTransactions` delegates to Actual's batch-update behavior.
- Final category on an added transaction is passed through unchanged.
- `learnCategories` defaults to `false`.
- `runTransfers` defaults to `false`.
- Errors from Actual are not swallowed.

### Integration/Manual Verification

Use a test budget where a payee rule sets category A.

1. Call `rules/run` with that payee and no category.
2. Confirm response suggests category A.
3. Submit `transactions/batch-update` with the same payee but category B.
4. Fetch account transactions.
5. Confirm the saved transaction has category B.
6. Fetch account balance and budget month to confirm Actual recalculated state.

## Actualist Follow-Up

Once the fork endpoint exists:

- Add `ActualAPIClient.runRules(...)`.
- Add `ActualAPIClient.batchUpdateTransactions(...)` or a narrowly named transaction-editor create method that uses the endpoint.
- Keep transport-only calls in the API client.
- Keep the conservative create/refetch workflow in `TransactionRepository`.
- Move rule preview behavior into `TransactionEditorViewModel`.
- Track which fields are rule-suggested vs manually edited so user overrides are respected.
- Do not place rule merging or payload construction in SwiftUI views.

## Upstream PR Strategy

Keep the change easy for the original maintainer to review:

- No rename or restructure of existing routes.
- No behavior change to existing transaction create/import endpoints.
- New endpoints clearly marked experimental/unofficial.
- Small tests that demonstrate the exact category-override use case.
- README note explaining that these endpoints mirror Actual's editor flow for clients that need rule preview plus final commit.

## Open Questions

- Does the packaged `@actual-app/api` expose a stable sender for `rules-run` and `transactions-batch-update`, or will the fork need to import Actual internals?
- What exact transaction fields are required by Actual's batch-update path for `added` transactions?
- Should the endpoint return Actual's full `added/updated/deleted` result, or normalize to the current wrapper's `{ data }` response style only?
- Should `runTransfers` default to `false` for all callers, or should the endpoint preserve Actual's internal default and let Actualist explicitly send `false`?
- Should custom payee creation remain on the existing create endpoint path for now, or should batch update support `payee_name` once confirmed against Actual internals?
