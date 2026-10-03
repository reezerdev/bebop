## 0.1.1

### Patch Changes

- Add collection index configuration and field defaults to generated Jazz schemas, typed client writes, and admin create forms.
- Support asynchronous relationship fields and preserve the current Jazz session identity in lifecycle hooks.
- Stage nested hook mutations transactionally so a failed hook rolls back the complete operation.
