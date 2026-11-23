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

## Follow-up flow review (read-only)

Rules reviewed: a user must not bypass authorized company access through the four selected internal lookups, must not submit arbitrary historical audit scores, and outbound financial-document recipients must follow the applicable server-side delivery policy. This review remains limited to the eight originally selected findings; it is not an app-wide security certification.

All entries below were read in source or from live function/policy definitions. None of the real email, fiscal, refactoring, shipment or scheduled-job operations were executed.

| Place encountered by the user | Code read | Result for the selected rule |
| --- | --- | --- |
| Direct data-interface calls to the four internal lookups | Live helper definitions/permissions; original migration and focused permission fixture | Fixed: direct user execution denied, service/owner calls retained. |
| Manual quotation-to-shipment conversion, including tariff revalidation decisions | `services/conversiones/embarques.ts`; live `crear_embarque_borrador_desde_cotizacion` and authorization section of `crear_embarque_borrador_core` | Public conversion enforces organization/role; supplier resolution remains inside the private owner-called helper. |
| Automatic draft after quotation acceptance | Live `_cotizacion_embarque_al_aceptar` | Calls the same authorized conversion as the assigned coordinator and restores prior request identity. Not executed. |
| Copying quotation costs and supplier aliases into shipment concepts | Live `_crear_embarque_replicar_conceptos` | Owner/service-only; no newly exposed direct lookup. |
| Opening a receiver-refactoring case | `services/refacturacion.ts`; live `abrir_caso_refacturacion` and `_assert_refacturador` | Organization/role checked before fiscal validation; destination customer must match the invoice organization. |
| Creating the replacement invoice draft | `services/refacturacionNueva.ts`; live `duplicar_factura_para_refacturacion` | Same organization/role guard and customer scoping precede the private tax validator. Existing business operations not executed. |
| Refactoring preview, including payment-complement counts | `RefacturacionPreviewPaso.tsx`, `services/refacturacionSimulacion.ts`; live `refacturacion_simular_paso` | Read-only preview guards the case organization before the now-private count helper. |
| Shipment Costs / automatic delays | `SeccionDemorasAuto.tsx`, `useDemorasEmbarque.ts`, `services/demorasEmbarque.ts`; live `calcular_demoras_embarque` | Organization membership checked before deriving conditions and calling private delay calculation; proformed/invoiced/payable-linked concepts block recalculation. |
| Per-container delay-date edits and automatic delivery/container recalculation | `TabDemoras.tsx`, `services/contenedores/demoras.ts`; live `trg_recalcular_demoras_contenedor` and `trg_recalcular_demoras_al_entregar` | Both triggers call the same shipment-scoped calculation; no alternative direct call to the private delay helper. |
| Operational audit page, executive score/regression and 30-day trend | `AuditoriaPage.tsx`, `AuditoriaEjecutivoTab.tsx`, `AuditoriaTendenciaChart.tsx`, `useAuditoriaEjecutivo.ts`, `useAuditoriaSnapshots.ts`, `services/snapshots.ts` | No direct client snapshot writes. Historical reads filter organization in the normal application flow; broader read-policy issue noted below. |
| Automatic snapshot when opening executive audit | `useAutoCapturarSnapshot` / `capturarSnapshotAuditoria`; live `auditoria_capturar_snapshot` | Sends organization only; server derives score/counts and checks capture authorization. |
| Daily audit snapshot job | `auditoria-snapshot-daily/index.ts` | Cron-secret gate and service-side snapshot capture; not run against production. |
| Organization export containing audit history | `exportOrg.tables.ts`, `exportOrg.ts` | Paged read with organization filter, no snapshot writes. This does not replace secure read policies. |
| Invoice detail / branded send and resend, To/CC and saved defaults | `FacturaDetalleModales.tsx`, `DialogEnviarFacturaBranded.tsx`, `useFacturaClienteDefaults.ts`, `services/mutations/enviarFacturaEmail.ts`; `enviar-factura-email/index.ts` and `helpers.ts` | Selected gap still present: syntax and membership checks do not bound To/CC addresses to customer contacts. Recipient restriction awaits confirmation. |
| Shared document recipient entry and copies to the sender | `EnviarDocumentoDialog.tsx` | Allows manual To/CC and adds the signed-in sender as locked CC. Restriction must reconcile this existing internal-copy behavior; no UI preferences changed. |
| Customer-linked quotation prepare/send/resend | `EnviarCotizacionDialog.tsx`, `services/mutations/enviarPorEmail.ts`; `enviar-cotizacion-email/index.ts`, `handlers.ts`, `sendHelpers.ts` | Server checks organization/role and compares To/CC with customer emails before sending. |
| Prospect quotation without linked customer | Same quotation code; specifically the early return in `validarEnvio` | Selected gap remains: recipient bounding is skipped when no customer is linked. No restriction added without confirmation. |
| Fiscal invoice, payment-complement and credit-note email dialog, plus post-stamping send | `DialogEnviarCfdi.tsx`, `useTimbrarFacturaDialogMutations.ts`, `services/enviarCfdiEmail.ts`; `facturapi-enviar-email/index.ts`, `destinatarioAutorizado.ts`, `overrideDestinatario.ts` | Different existing policy: role-checked third-party overrides and internal-domain copies. Not equivalent to contact-only delivery; outside the selected email findings and unchanged. |
| Bulk fiscal invoice resend and automatic newly-stamped payment-complement email | `services/masivas.ts`, `services/repAutoEmail.ts` | Use the same fiscal endpoint; bulk send uses recorded recipient resolution, automatic payment-complement send uses a stored customer contact. Existing fiscal exceptions retained. |
| Proforma send/retry | `enviar-proforma-email/index.ts` and `destinatarios.ts`; `_shared/destinatarioCliente.ts` | Bounds To/CC to stored customer addresses before reserving/delivering. Unchanged; prior fix preserved. |
| Collection reminder send and confirmation | `cxc-recordatorio-enviar/index.ts`, `_shared/recordatorio/handler.ts`, `factura.ts`, `entrega.ts`, `_shared/recordatorioDestinatario.ts` | Rechecks organization/role and current customer/contact identity before transport. No free recipient fallback. |
| Collection reminder listing/preparation | `cxc-recordatorios/index.ts`, `helpers.ts` | Scopes ordinary callers to their organization and lists invoice windows; does not itself deliver email. |
| Shared branded email transport | `_shared/enviarEmailPlantilla.ts` | Transports the address supplied by the caller; recipient authorization belongs to each entry point. Therefore it does not fix the remaining invoice/prospect gaps by itself. |

Additional focused service tests: **44 passed** across audit snapshots, refactoring preview, fiscal email adapters, automatic payment-complement email, shipment delays and branded invoice-email service. They are isolated tests, not evidence of actual customer delivery or a complete user-flow run. The earlier **12 local permission checks** and live permission checks remain valid.

### Outside-selection observation requiring authorization

Live audit snapshot read policies include an authenticated `ALL` policy whose condition admits ordinary non-superadmin users without a row-specific organization check. Because the policies are permissive, the normal frontend organization filter is not a server-side barrier to direct cross-company snapshot reads. This is a separate read-access concern, not the selected arbitrary-score-write finding. It was surfaced, not changed, ignored or registered as a new finding in security-fixing mode. Explicit scope expansion is required to address it.

The contact helper also retains its existing eligibility/soft-delete rules, and fiscal third-party exceptions remain as configured; neither was silently tightened in this review. Paid, sent, refunded, closed and other settled records were untouched. No further application, permission or setting changes were made during this follow-up.

Still unverified/pending: real authenticated end-to-end business flows, actual scheduled-job execution and email/fiscal delivery, full CI/RLS/postchecks in GitHub Actions, isolated release-history integration, and recipient-policy confirmation for the three selected email findings.