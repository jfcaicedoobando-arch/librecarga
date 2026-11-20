# Selected security fixes — 20/11/2026

## Applied and verified

The Cloud migration tool applied `0083_selected_security_internal_helpers_snapshot_writes.sql` to the project database. It changed permissions only; no business records, financial calculations, user identities, email sends, fiscal calls or frontend publication were performed.

- Supplier-name resolution, blocking payment counts, fiscal receiver validation and container delay calculations no longer allow direct execution by signed-in or anonymous users. Function owners and service execution remain intact; existing authorized workflows call the same unchanged functions internally.
- Audit snapshots no longer allow direct insert/update/delete through the data interface. Existing read permissions are unchanged. The existing snapshot capture function still calculates values server-side, checks authorization and writes as its owner; scheduled capture remains available.

Live checks confirmed the four helpers are not executable by signed-in/anonymous users and remain executable by the service. Snapshot writes are denied to those users, server writes remain allowed, and authorized capture remains callable.

## Focused validation

```bash
bash scripts/tests/selected-security-permissions.sh
```

Twelve checks passed in a temporary local PostgreSQL database restored from the existing schema reference and applying only the selected permission migration. Actual direct calls were rejected; nested owner calls to the unchanged helper bodies and server snapshot writes remained possible. No project records were used. The schema reference was regenerated with the existing snapshot script and its diff contains only the selected permission changes.

Full CI/RLS and `db:postcheck` were **not run locally**; they remain for GitHub Actions. This is not a completed release certification.

## Remaining selected findings

The two invoice-email findings describe the same recipient-validation gap. The quote-email finding concerns quotations without a linked customer. These three findings remain active, pending confirmation to restrict delivery to recorded customer contacts or the prospect's recorded email. No recipient restrictions or email function deployments were made in this change.

Five other active findings outside the user's selection were not modified or ignored.

## Release-history integration limitation

The Cloud tool generated the migration, journal entry and schema metadata. Adding the new entry to `drizzle/replay.json` was refused by the platform's migration-history protection; the rejected patch applied nothing. The test-only replay registry and its mirrors remain unchanged. This migration therefore still needs integration with the project's isolated CI history before release certification. No protected history files were edited through another tool to bypass that restriction.

The prepared shipment margin candidates remain unapplied. Their provisional numbers are not migration-history entries and do not authorize activation.