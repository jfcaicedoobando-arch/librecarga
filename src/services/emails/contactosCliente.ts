import { supabase } from "@/integrations/supabase/client";
import {
  CLIENTE_PRINCIPAL_ID, EMAIL_RE, type ContactoClienteEmail,
} from "@/lib/domain/contactoClienteEmail";

export async function fetchContactosClienteConEmail(
  clienteId: string,
): Promise<ContactoClienteEmail[]> {
  const [{ data: contactosData, error: errContactos }, { data: clienteData, error: errCliente }] =
    await Promise.all([
      supabase
        .from("contactos_cliente")
        .select("id, nombre, contacto, email, tipo")
        .eq("cliente_id", clienteId)
        .is("deleted_at", null),
      supabase
        .from("clientes")
        .select("nombre, email")
        .eq("id", clienteId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
  if (errContactos) throw errContactos;
  if (errCliente) throw errCliente;

  const contactos = (contactosData ?? []).filter(
    (c) => c.email && EMAIL_RE.test(c.email),
  ) as ContactoClienteEmail[];

  const out: ContactoClienteEmail[] = [];
  const emailPrincipal = clienteData?.email?.trim();
  if (emailPrincipal && EMAIL_RE.test(emailPrincipal)) {
    out.push({
      id: CLIENTE_PRINCIPAL_ID,
      nombre: clienteData?.nombre ?? "",
      contacto: clienteData?.nombre ?? "",
      email: emailPrincipal,
      tipo: "Cliente",
    });
  }
  const principalLower = emailPrincipal?.toLowerCase();
  for (const c of contactos) {
    if (principalLower && c.email.toLowerCase() === principalLower) continue;
    out.push(c);
  }
  return out;
}
