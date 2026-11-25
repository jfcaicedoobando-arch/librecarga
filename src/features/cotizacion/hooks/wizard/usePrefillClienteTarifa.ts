/**
 * Precarga el cliente de una ficha o tarifa cuando el contexto está listo.
 * Conserva cualquier destinatario que ya esté capturado.
 */
import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { CotizacionFormValues } from "@/features/cotizacion/types";

export function permitePrecargarClienteDeFicha({ params, clientes, organizationId, error, habilitado }: {
  params: URLSearchParams;
  clientes: { id: string }[];
  organizationId: string | null;
  error: boolean;
  habilitado: boolean;
}) {
  const clienteId = params.get("cliente");
  const otroContexto = ["tarifa", "tarifaAerea", "oportunidad", "plantilla"].some((clave) => params.has(clave));
  return Boolean(organizationId) && !error && habilitado && !otroContexto && clientes.some((cliente) => cliente.id === clienteId);
}

export function usePrefillClienteTarifa(
  form: UseFormReturn<CotizacionFormValues>,
  clienteId: string | null,
  prefillAplicado: boolean,
) {
  const hecho = useRef(false);
  useEffect(() => {
    if (!clienteId || !prefillAplicado || hecho.current) return;
    hecho.current = true;
    const v = form.getValues();
    if (v.clienteId || v.esProspecto) return;
    form.setValue("clienteId", clienteId, { shouldDirty: true, shouldValidate: true });
    void form.trigger("clienteId");
  }, [form, clienteId, prefillAplicado]);
}
