import type { SnapshotFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";

export function fiscalCotizacionFixture(overrides: Partial<SnapshotFiscalCotizacion> = {}): SnapshotFiscalCotizacion {
  return {
    schema_version: "cotizacion_fiscal_v1", estado: "confirmado", organization_id: "org-a", cliente_id: null,
    perfil_id: "perfil-qa", perfil_version: 1, regla_version: "isr_resico_v1", precision_version: "agrupado_v1",
    conceptos_fingerprint: "a".repeat(32), ambiente: "sandbox", motivos: [],
    bloques: [{ moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 0, total: 230.42 }],
    ...overrides,
  };
}
