import { z } from "zod";

export const perfilFiscalEmisorSchema = z.object({
  ambiente: z.enum(["sandbox", "live"]),
  version: z.number().int().nonnegative(),
  estado: z.enum(["sin_sincronizar", "requiere_revision", "sin_confirmar", "confirmado"]),
  problemas: z.array(z.string()),
  perfil: z.object({
    id: z.string().uuid(), organization_id: z.string().uuid(),
    ambiente: z.enum(["sandbox", "live"]), version: z.number().int().positive(),
    facturapi_org_id: z.string(), rfc: z.string().nullable(), razon_social: z.string().nullable(),
    tipo_persona: z.enum(["fisica", "moral"]).nullable(), regimen_fiscal: z.string().nullable(),
    codigo_postal: z.string().nullable(), origen: z.literal("facturapi"),
    sincronizado_at: z.string(), confirmado_at: z.string().nullable(), vigente_desde: z.string().nullable(),
  }).nullable(),
});
export type PerfilFiscalEmisor = z.infer<typeof perfilFiscalEmisorSchema>;

const PROBLEMAS: Record<string, string> = {
  credenciales_pendientes: "Conecta Facturapi para sincronizar los datos fiscales.",
  credenciales_cambiadas: "Cambió la configuración de Facturapi. Sincroniza nuevamente.",
  organizacion_discordante: "La organización de la llave no coincide con el ID vinculado en Facturapi. Revisa la conexión.",
  rfc_invalido: "Completa un RFC válido del emisor en Facturapi; los RFC genéricos no identifican al emisor.",
  rfc_empresa_pendiente: "Guarda el RFC de tu organización en Configuración → Empresa.",
  rfc_empresa_discordante: "El RFC de Facturapi no coincide con Configuración → Empresa. Revisa ambos antes de confirmar.",
  razon_social_pendiente: "Completa la razón social en los datos fiscales de Facturapi.",
  regimen_invalido: "Revisa el régimen fiscal del emisor en Facturapi.",
  codigo_postal_invalido: "Completa el código postal fiscal de cinco dígitos en Facturapi.",
};
export const mensajeProblemaPerfil = (codigo: string) => PROBLEMAS[codigo] ?? "Revisa los datos fiscales antes de confirmar.";

export const ESTADOS_PERFIL: Record<PerfilFiscalEmisor["estado"], string> = {
  sin_sincronizar: "Sin sincronizar", requiere_revision: "Requiere revisión",
  sin_confirmar: "Pendiente de confirmación", confirmado: "Confirmado con constancia fiscal",
};
