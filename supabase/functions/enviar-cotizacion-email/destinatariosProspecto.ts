/**
 * Correos autorizados para una cotización de prospecto (sin cliente): el
 * correo capturado en la cotización, el del lead de la oportunidad y los
 * contactos CRM ligados a la oportunidad, siempre dentro de la misma org.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.2';

export async function emailsPermitidosProspecto(
  admin: SupabaseClient,
  org: string,
  oportunidadId: string | null | undefined,
  prospectoEmail: string | null | undefined,
): Promise<Set<string>> {
  const correos: (string | null | undefined)[] = [prospectoEmail];
  if (oportunidadId) {
    const { data: op, error } = await admin.from('crm_oportunidades')
      .select('lead_id').eq('id', oportunidadId).eq('organization_id', org).maybeSingle();
    if (error) throw error;
    if (op) {
      const leadId = (op as { lead_id?: string | null }).lead_id;
      if (leadId) {
        const { data: lead, error: e2 } = await admin.from('crm_leads')
          .select('email').eq('id', leadId).eq('organization_id', org).maybeSingle();
        if (e2) throw e2;
        correos.push((lead as { email?: string | null } | null)?.email);
      }
      const { data: links, error: e3 } = await admin.from('crm_oportunidad_contacto')
        .select('contacto_id').eq('oportunidad_id', oportunidadId).eq('organization_id', org);
      if (e3) throw e3;
      const ids = ((links ?? []) as { contacto_id: string }[]).map((l) => l.contacto_id);
      if (ids.length > 0) {
        const { data: cs, error: e4 } = await admin.from('crm_contactos')
          .select('email').in('id', ids).eq('organization_id', org).is('deleted_at', null);
        if (e4) throw e4;
        for (const c of (cs ?? []) as { email?: string | null }[]) correos.push(c.email);
      }
    }
  }
  return new Set(correos.map((e) => (e ?? '').trim().toLowerCase()).filter((e) => e.length > 0));
}
