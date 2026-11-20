import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { captureAuthDataScope } from '@/lib/auth/authOperationScope';

const snapshotSchema = z.object({
  moneda: z.enum(['MXN', 'USD', 'EUR']), venta: z.number().nullable(), costo: z.number().nullable(),
  margen_pct: z.number().nullable(), minimo_pct: z.number(), calculable: z.boolean(),
  requiere_aprobacion: z.boolean(),
}).passthrough();
export const aprobacionMargenSchema = z.object({
  estado: z.enum(['no_requerida', 'sin_solicitar', 'pendiente', 'aprobada']),
  snapshot: snapshotSchema, solicitada_at: z.string().nullable(), autorizada_at: z.string().nullable(),
  puede_aprobar: z.boolean(),
});
export type AprobacionMargen = z.infer<typeof aprobacionMargenSchema>;
type NombreRpc = 'consultar_aprobacion_margen_embarque' | 'solicitar_aprobacion_margen_embarque' | 'aprobar_margen_embarque';
type RpcPreparada = (nombre: NombreRpc, args: Record<string, unknown>) => Promise<{
  data: unknown; error: { code?: string; message: string } | null;
}>;

async function llamar(nombre: NombreRpc, args: Record<string, unknown>, tolerarAusencia = false) {
  const scope = captureAuthDataScope();
  // SAFE-CAST: contrato candidato sin desplegar; no modificar los tipos generados de la base activa.
  const client = supabase as unknown as { rpc: RpcPreparada };
  const { data, error } = await client.rpc.call(supabase, nombre, args);
  scope.assertCurrent();
  // Sólo ausencia exacta de esta RPC permite conservar el flujo previo. Otros errores no se ocultan.
  if (tolerarAusencia && error?.code === 'PGRST202' && error.message.includes(nombre)) return null;
  if (error) throw error;
  return aprobacionMargenSchema.parse(data);
}

/** Sin la candidata aplicada, devuelve null: nunca se habilita el guardado nuevo por un error de red. */
export function consultarAprobacionMargen(id: string) {
  return llamar('consultar_aprobacion_margen_embarque', { p_id: id }, true);
}
export function solicitarAprobacionMargen(id: string) {
  return llamar('solicitar_aprobacion_margen_embarque', { p_id: id });
}
export function aprobarMargen(id: string, snapshot: AprobacionMargen['snapshot'], motivo: string) {
  return llamar('aprobar_margen_embarque', { p_id: id, p_snapshot: snapshot, p_motivo: motivo.trim() });
}
