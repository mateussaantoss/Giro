# Inventory backend, version 1

## Storage and deployment

`createInventory(DATA_DIR)` receives its directory explicitly; it does not read
environment variables. The server supplies its existing `GIRO_DATA_DIR`-based
directory. No inventory file is created until the first successful mutation.

`inventory.json` contains `items`, `movements`, `materials`, optional `reservations` and `operations` in
one snapshot. Mutations synchronously clone the committed snapshot, validate,
apply all changes, write a uniquely named temporary file with mode `0600`, fsync
the file, close it and atomically rename it. Only then is the in-memory snapshot
replaced. There is no fallible filesystem work after a successful rename.
Write/fsync/rename failures leave the committed state unchanged; temporary file
cleanup is best-effort and preserves the original error. Invalid existing JSON fails loading instead of being
silently overwritten. Loading validates required fields, types, units, dates,
unique IDs, workshop-scoped references, the movement ledger against balances,
stock consumption/reversal totals against materials, and persisted operation
keys/payloads/public results. Unknown saved fields and malformed records fail
closed; there is no automatic schema migration in this new module.

This version supports **one Node process and one inventory instance per data
directory only**. Do not use cluster, multiple replicas or external file writers.
There is no cross-process lock. Full JSON cloning/rewriting and retained history
are suitable for the current small backend, not unlimited-volume deployment.
For multiple writers, migrate to transactional storage. File fsync and rename
are implemented; directory fsync/power-loss durability is not guaranteed.

## API contract

The frontend contract is preserved:

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/inventory` | `{items, movements}`; items also expose `onHand`, `reserved` and `available` |
| POST | `/api/inventory/items` | `{item}` (201) |
| PATCH | `/api/inventory/items/:id` | `{item}` |
| POST | `/api/inventory/movements` | `{item, movement}` (201) |
| GET | `/api/orders/:id/materials` | `{materials}` |
| POST | `/api/orders/:id/materials` | `{materials, material}` (201) |
| POST | `/api/orders/:id/materials/:materialId/reverse` | `{materials, material}` |
| GET | `/api/orders/:id/reservations` | `{reservations}` |
| POST | `/api/orders/:id/reservations` | `{reservation, reservations, item}` (201) |
| DELETE | `/api/orders/:id/reservations/:reservationId` | `{reservation, reservations}` |
| POST | `/api/orders/:id/commit-materials` | `{materials, reservations}` |

`publicOrder` also includes `materials`, `reservations`, service details, pending
items and labor totals. `estimatedValue` remains hidden until delivery for
compatibility. `POST /api/orders/quick` is a temporary alias for the unified
service-order creation endpoint; new records use history action `created`.
All item/material/movement lookups are workshop-scoped. Order routes use
`findVisibleOrder`: mechanics only see their assigned orders.

Quantities and minimums are stored as integer thousandths and returned as JSON
numbers with up to three decimal places (JSON numbers do not retain trailing
zeroes). Quantity inputs must be numbers, not strings; consumption/movements
require positive quantities. Units: `UN`, `KIT`, `L`, `ML`, `KG`, `G`, `M`.
Scaled quantities/cents must fit safe integers. Quantities are parsed using exact
decimal digits, and balances must also round-trip through their JSON number
representation without losing a thousandth; otherwise the request returns 400.
Free-name non-stock materials default to `UN` when unit is omitted. Linked
materials inherit the catalog item's name/unit.

Item creation accepts numeric `initialQuantity` (nonnegative, up to three decimal
places; defaults to zero). A positive initial quantity for a tracked item creates
one ENTRY movement with reason `Estoque inicial` in the same atomic, idempotent
operation as the item; the response remains `{item}`. The frontend sends zero for
untracked items. Creation offers "Quantidade em estoque"; editing shows a
read-only balance and directs adjustments to ENTRY/EXIT to avoid overwriting
concurrent consumption. SKU remains supported and persisted by the backend, but
is absent from frontend fields, rows and search; frontend PATCH omits it rather
than clearing existing values.

PATCH accepts only `name`, `sku`, `category`,
`minimumQuantity`, `costPrice`, `active`; unit, tracking and balance are immutable
through this endpoint. Costs must be nonnegative numbers, rounded to integer
cents using decimal half-up rounding. Only OWNER can provide/edit `costPrice`;
it is omitted from all other roles' responses, including idempotency replays.

ENTRY/EXIT require a reason and an active tracked item. Only STOCK consumption
changes balance; it requires an active tracked item. ORDER_PURCHASE uses a free
name and no itemId. UNTRACKED supports a free name or active non-tracked item.
No operation can make balance negative. Material reversal is integral, preserves
the material with `REVERSED` status and adds a REVERSAL movement for STOCK.
Inactive catalog items can still have previously consumed stock returned.

OWNER/MANAGER can manage, move, add, reserve and commit materials and reverse
them. MECHANIC can read the catalog (no costs and `movements: []`) and
reserve/commit materials on assigned orders, but cannot reverse. ATTENDANT can
read visible order materials but cannot write materials or access inventory.
Closed or cancelled orders reject new consumption/reservations.
Completion, delivery and reopening never create inventory movements.

Inventory POST mutations require a nonblank string `operationId` (max 200 chars).
Successful results persist with the workshop/user/concrete-route/operationId key.
Object key order is ignored when comparing payloads. Identical retry returns the
original snapshot result without mutation, even after restart; different payload
returns 409. Authorization and order visibility are checked before replay. A
retry of an already committed operation after closure is only a replay, not a
new consumption/reversal. Failed operations are not recorded. PATCH metadata is
not idempotency-keyed. Operations/history are retained without automatic pruning.

## Administrative orders

`POST /api/orders/quick` now accepts `os.create` OR `os.quick.create`.
OWNER/MANAGER may supply `assignedUserId` with `os.assign`; the target must be an
ACTIVE mechanic in the same workshop. ATTENDANT can create without assignment.
MECHANIC always creates assigned to themselves; an explicit assignment field is
ignored, preserving the shipped quick-create behavior. Financial fields and
frontend local-state migration are outside
this backend change. Existing order persistence is not part of the inventory
snapshot and was not converted into a cross-file transaction.

Quick-create `operationId` is optional for shipped consumers. If present, it must
be a nonblank string of at most 200 characters. The order itself stores
`creationOperation: {id, actorId, payloadHash}` in `service-orders.json`; no
inventory operation or duplicate PII payload is stored. SHA256 covers all raw
request fields, including ignored fields, with sorted top-level keys for the flat
form payload. Scope is workshop + createdBy + operationId. Same payload returns
201 with the current visible order and its current client/vehicle references,
without creating records/history or repeating the audit; different payload is
409. Current create permission and order visibility are still required on replay.
`creationOperation` is never included in `publicOrder`.

Mechanic PATCH normally accepts only `status` and rejects other fields with 403,
before applying any change. One shipped compatibility exception remains because
`invitation-flow.test.js` completes an own incomplete quick order: an assigned
mechanic may fill empty text fields on their own incomplete order without a
registered vehicle. Such a request must contain only text fields, fill at least
one empty non-issue field, and cannot overwrite any existing text field except
refining `issue` as part of that completion. A mixed status/text request is
rejected. This is not general permission to edit client, plate or vehicle data.
OWNER/MANAGER editing remains unchanged.

## Verification

Run `node --test test/inventory.test.js test/password-reset.test.js test/permissions.test.js`.
Inventory tests use temporary directories, empty SMTP configuration and a VM
Express app with a stubbed `listen`; no real server or real data is used. The
existing password-reset VM test resolves `./inventory` relative to `server.js`
and continues using its temporary directory and mocked SMTP transport.
Tests that spawn an actual server are deliberately excluded from this command.
The full `node --test` suite also runs the existing invitation and tenant tests,
which start test-only servers against temporary directories. Run it with empty
`SMTP_HOST`, `SMTP_FROM`, `SMTP_USER` and `SMTP_PASS`; the browser smoke test is
skipped when its browser prerequisites are unavailable.
