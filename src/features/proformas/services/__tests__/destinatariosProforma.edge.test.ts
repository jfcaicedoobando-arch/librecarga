import { describe, expect, it } from "vitest";
// Ruta dinámica: el archivo es de Deno y no debe entrar al typecheck de la app.
const RUTA = "../../../../../supabase/functions/enviar-proforma-email/destinatarios.ts";
type Fn = (admin: never, proformaId: string, usuarioId: string, correos: string[]) => Promise<{ code: string } | null>;
const { destinatariosAjenos } = (await import(/* @vite-ignore */ RUTA)) as { destinatariosAjenos: Fn };

function admin(opts: { proforma?: unknown; miembro?: unknown; contactos?: string[]; clienteEmail?: string | null }) {
  return { from(table: string) {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "not"]) chain[k] = () => chain;
    chain.maybeSingle = async () => ({ data: table === "proformas" ? opts.proforma ?? null
      : table === "organization_members" ? opts.miembro ?? null
      : { email: opts.clienteEmail ?? null }, error: null });
    chain.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: (opts.contactos ?? []).map((email) => ({ email })), error: null }).then(fn);
    return chain;
  } } as never;
}
const proforma = { organization_id: "o1", cliente_id: "c1" };

describe("destinatarios de proforma", () => {
  it("permite contactos y correo del cliente sin distinguir mayúsculas", async () => {
    const r = await destinatariosAjenos(admin({ proforma, miembro: { user_id: "u" }, contactos: ["Ana@Cliente.mx"], clienteEmail: "pagos@cliente.mx" }),
      "p", "u", ["ana@cliente.mx", "PAGOS@cliente.mx"]);
    expect(r).toBeNull();
  });
  it("rechaza un correo ajeno al cliente", async () => {
    const r = await destinatariosAjenos(admin({ proforma, miembro: { user_id: "u" }, contactos: ["ana@cliente.mx"] }),
      "p", "u", ["ana@cliente.mx", "extraño@otro.com"]);
    expect(r).toMatchObject({ code: "DESTINATARIO_NO_PERMITIDO" });
  });
  it("no responde por proformas de otra organización (la reserva niega el acceso)", async () => {
    const r = await destinatariosAjenos(admin({ proforma, miembro: null }), "p", "u", ["x@otro.com"]);
    expect(r).toBeNull();
  });
});
