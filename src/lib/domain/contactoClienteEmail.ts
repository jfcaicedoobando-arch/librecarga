export interface ContactoClienteEmail {
  id: string;
  nombre: string;
  contacto: string;
  email: string;
  tipo: string | null;
}

export const CLIENTE_PRINCIPAL_ID = "__cliente_principal__";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROVEEDOR_TIPO_RE = /(proveedor|exportador|shipper|fabric)/i;
const CLIENTE_PRIORIDAD_RE = /(cliente|cotiz|operativ|administ|cobran)/i;

export function esContactoProveedor(c: Pick<ContactoClienteEmail, "tipo">): boolean {
  return !!c.tipo && PROVEEDOR_TIPO_RE.test(c.tipo);
}

export function esContactoPrioridadCliente(c: Pick<ContactoClienteEmail, "tipo">): boolean {
  return !!c.tipo && CLIENTE_PRIORIDAD_RE.test(c.tipo);
}
