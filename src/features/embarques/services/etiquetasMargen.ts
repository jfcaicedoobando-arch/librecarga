import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { captureAuthDataScope } from '@/lib/auth/authOperationScope';

const etiquetaSchema = z.object({
  autorizada_por: z.string().uuid().nullable(), autorizada_email: z.string().nullable(),
  autorizada_at: z.string().nullable(), vigente: z.boolean(),
});
export type EtiquetaMargen = z.infer<typeof etiquetaSchema>;
type RpcEtiquetas = (name: 'consultar_etiquetas_margen_embarques', args: { p_ids: string[] }) => Promise<{
  data: unknown; error: { code?: string; message: string } | null;
}>;

export async function consultarEtiquetasMargen(ids: string[]): Promise<Record<string, EtiquetaMargen>> {
  if (!ids.length) return {};
  const scope = captureAuthDataScope();
  // SAFE-CAST: RPC candidata sin aplicar; no alterar los tipos generados de la base activa.
  const client = supabase as unknown as { rpc: RpcEtiquetas };
  const result: Record<string, EtiquetaMargen> = {};
  for (let from = 0; from < ids.length; from += 100) {
    const { data, error } = await client.rpc.call(supabase, 'consultar_etiquetas_margen_embarques', { p_ids: ids.slice(from, from + 100) });
    scope.assertCurrent();
    if (error?.code === 'PGRST202' && error.message.includes('consultar_etiquetas_margen_embarques')) return {};
    if (error) throw error;
    Object.assign(result, z.record(z.string(), etiquetaSchema).parse(data));
  }
  return result;
}