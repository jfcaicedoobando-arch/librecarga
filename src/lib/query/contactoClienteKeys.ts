import type { captureAuthDataScope } from "@/lib/auth/authOperationScope";

type Scope = ReturnType<typeof captureAuthDataScope>;
const all = ["contactos_cliente"] as const;
const porCliente = (id: string) => [...all, id] as const;

export const contactosClienteKeys = {
  all,
  porCliente,
  paraCorreo: (id: string, { userId, organizationId, role, generation }: Scope) =>
    [...porCliente(id), "para-correo", userId, organizationId, role, generation] as const,
};
