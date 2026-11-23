/**
 * Hidratación de datos para exports/generadores de facturas.
 *
 * Centraliza las consultas a Supabase que antes vivían dentro de
 * `src/generators/layoutContable.ts` y `src/generators/estadoCuentaPdf.ts`.
 * Los generadores ahora reciben DTOs ya hidratados y se enfocan únicamente
 * en presentación (CSV / HTML / PDF).
 *
 * v8.205.0 — P0.4 auditoría arquitectónica.
 */
import { supabase } from "@/integrations/supabase/client";
import type { captureAuthOperationScope } from "@/lib/auth/authOperationScope";
import { chunkIds } from "@/lib/supabase/chunkedIn";
import { fetchEstadoCuenta, type FacturaEstadoCuenta } from "../estadoCuenta/services/estadoCuenta";

export interface LayoutContableRow {
  numero: string;
  fecha_emision: string;
  subtotal: number | null;
  iva: number | null;
  total: number;
  moneda: string;
  tipo_cambio: number | null;
  expediente: string;
  referencia_bl: string | null;
  estado: string;
  cliente_id: string | null;
  cliente_nombre: string;
}

export interface LayoutContableData {
  facturas: LayoutContableRow[];
  rfcByClienteId: Map<string, string>;
}

/**
 * Carga por lotes las facturas indicadas y conserva el orden del listado.
 * Devuelve un DTO listo para que el generador CSV mapee filas sin hacer I/O.
 */
export async function fetchLayoutContableData(
  facturaIds: string[],
  scope: ReturnType<typeof captureAuthOperationScope>,
): Promise<LayoutContableData> {
  if (facturaIds.length === 0) return { facturas: [], rfcByClienteId: new Map() };
  const { organizationId } = scope;
  if (!organizationId) throw new Error("Selecciona una organización para exportar el layout.");
  const facturas: LayoutContableRow[] = [];
  for (const lote of chunkIds(facturaIds)) {
    scope.assertCurrent();
    const { data: rows, error } = await supabase
      .from("facturas")
      .select("id, numero, fecha_emision, subtotal, iva, total, moneda, tipo_cambio, expediente, referencia_bl, estado, cliente_id, cliente_nombre")
      .eq("organization_id", organizationId)
      .in("id", lote)
      .is("deleted_at", null);
    scope.assertCurrent();
    if (error) throw error;
    const porId = new Map((rows ?? []).map((fila) => [fila.id, fila]));
    for (const id of lote) {
      const fila = porId.get(id);
      if (!fila) throw new Error("No se pudieron cargar todas las facturas del layout. Actualiza e inténtalo de nuevo.");
      facturas.push(fila);
    }
  }
  const clienteIds = facturas.flatMap(({ cliente_id }) => cliente_id ? [cliente_id] : []);

  const rfcByClienteId = new Map<string, string>();
  for (const lote of chunkIds(clienteIds)) {
    scope.assertCurrent();
    const { data: clientes, error: cErr } = await supabase
      .from("clientes")
      .select("id, rfc")
      .eq("organization_id", organizationId)
      .in("id", lote)
      .is("deleted_at", null);
    scope.assertCurrent();
    if (cErr) throw cErr;
    for (const c of clientes ?? []) {
      if (c.rfc) rfcByClienteId.set(c.id, c.rfc);
    }
  }

  return { facturas, rfcByClienteId };
}

export interface EstadoCuentaFactura {
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  total: number;
  saldo: number;
  moneda: string;
  estado: string;
  expediente: string;
}

/** Conserva el saldo del mismo corte que alimenta la tabla y el CSV. */
export function toEstadoCuentaFacturas(rows: readonly FacturaEstadoCuenta[]): EstadoCuentaFactura[] {
  return rows.map((f) => ({
    numero: f.numero,
    fecha_emision: f.fecha_emision,
    fecha_vencimiento: f.fecha_vencimiento,
    total: f.total,
    saldo: f.saldo,
    moneda: f.moneda,
    estado: f.estado_factura,
    expediente: f.expediente,
  })).sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision));
}

/** Facturas vivas y saldo neto; incluye pagos parciales y excluye saldadas. */
export async function fetchEstadoCuentaFacturas(clienteId: string): Promise<EstadoCuentaFactura[]> {
  const rows = await fetchEstadoCuenta({ clienteIds: [clienteId] });
  return toEstadoCuentaFacturas(rows).filter((f) => f.saldo > 0);
}
