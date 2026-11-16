import { z } from "npm:zod@4.6.7";
import { jsonResponse } from "../_shared/response.ts";
import type { AdminClient, Cotizacion } from "./sendHelpers.ts";

// The RPC validates the complete fiscal snapshot and current authorization. This
// boundary only accepts its public fields needed by the email and PDF identity.
const resultadoSchema = z.object({
  schema_version: z.literal("cotizacion_fiscal_v1"), estado: z.literal("confirmado"),
  organization_id: z.string(), cliente_id: z.string().nullable(),
  conceptos_fingerprint: z.string().regex(/^[a-f0-9]{32,64}$/),
  bloques: z.array(z.object({ moneda: z.enum(["MXN", "USD"]), total: z.number().finite().nonnegative() })).max(2),
});
type FiscalEnvio = z.infer<typeof resultadoSchema>;

export async function validarFiscalEnvio(admin: AdminClient, cot: Cotizacion, userId: string, expected: unknown,
  cors: Record<string, string>): Promise<{ fiscal: FiscalEnvio | null } | Response> {
  if (expected != null && (typeof expected !== "string" || !/^[a-f0-9]{32,64}$/.test(expected))) {
    return jsonResponse({ error: "La revisión fiscal solicitada no es válida." }, 409, cors);
  }
  const { data, error } = await admin.rpc("validar_cotizacion_fiscal_envio", {
    p_cotizacion_id: cot.id, p_expected_fingerprint: expected ?? null, p_usuario_id: userId,
  });
  if (error) return jsonResponse({ error: "La cotización requiere revisión fiscal antes de enviarse." }, error.code === "42501" ? 403 : 409, cors);
  if (data === null && expected == null) return { fiscal: null };
  const result = resultadoSchema.safeParse(data);
  if (!result.success || result.data.organization_id !== cot.organization_id
    || result.data.cliente_id !== (cot.cliente_id ?? null) || result.data.conceptos_fingerprint !== expected) {
    return jsonResponse({ error: "La evaluación fiscal cambió. Recarga y vuelve a preparar el documento." }, 409, cors);
  }
  return { fiscal: result.data };
}

export function totalesFiscalesCorreo(fiscal: FiscalEnvio): { mxn?: string; usd?: string } {
  return Object.fromEntries(fiscal.bloques.map((b) => [b.moneda.toLowerCase(),
    `${b.moneda} ${b.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]));
}

export function rutaPdfFiscal(path: string, fingerprint?: string): string {
  if (!fingerprint) return path;
  const ultimo = path.lastIndexOf("/");
  return `${path.slice(0, ultimo + 1)}fiscal-${fingerprint}-${path.slice(ultimo + 1)}`;
}
