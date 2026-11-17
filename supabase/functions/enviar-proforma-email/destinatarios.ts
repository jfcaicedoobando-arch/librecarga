/**
 * Los destinatarios de una proforma deben pertenecer al cliente (contactos o
 * correo del cliente). Sólo responde para miembros de la organización; si no,
 * deja que la reserva rechace el acceso sin revelar datos.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { DESTINATARIO_NO_PERMITIDO, emailsPermitidosCliente } from '../_shared/destinatarioCliente.ts';

export async function destinatariosAjenos(
  admin: SupabaseClient,
  proformaId: string,
  usuarioId: string,
  correos: string[],
): Promise<{ error: string; code: string } | null> {
  const { data: proforma, error } = await admin.from('proformas')
    .select('organization_id, cliente_id').eq('id', proformaId).maybeSingle();
  if (error) throw error;
  if (!proforma) return null;
  const { data: miembro, error: errorMiembro } = await admin.from('organization_members')
    .select('user_id').eq('organization_id', proforma.organization_id).eq('user_id', usuarioId).maybeSingle();
  if (errorMiembro) throw errorMiembro;
  if (!miembro) return null;
  const permitidos = proforma.cliente_id
    ? await emailsPermitidosCliente(admin, proforma.cliente_id)
    : new Set<string>();
  const ajenos = correos.filter((e) => !permitidos.has(e.trim().toLowerCase()));
  if (ajenos.length === 0) return null;
  return { error: 'Uno o más correos no pertenecen a los contactos del cliente', code: DESTINATARIO_NO_PERMITIDO };
}
