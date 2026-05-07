# Data Invariants

- A merchant must have a valid `name` and `address`.
- `visitResult` and `installStatus` must be valid values.
- `assignees` list is managed globally.

# The "Dirty Dozen" Payloads

1. Create merchant without name.
2. Create merchant with invalid visitResult.
3. Update merchant with extra invalid fields.
4. Update merchant, altering `createdAt`.
5. Update merchant, bypassing string size limits.
6. Delete merchant (should be allowed only if authenticated).
7. Read merchant unauthenticated.
8. Update settings without auth.
9. Inject 1.5MB junk in `notes`.
10. Update merchant with number as name.
11. Update merchant with invalid date format for visitDate.
12. Create merchant without createdAt set to request.time.
