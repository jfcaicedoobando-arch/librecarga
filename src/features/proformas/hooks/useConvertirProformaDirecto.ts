/**
 * useConvertirProformaDirecto — conversión Proforma(s) → Factura borrador
 * en un solo clic, sin diálogo intermedio.
 *
 * Toma la primera serie activa, PPD, forma 99 y un uso compatible con el receptor.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/shared/useToast";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  convertirProformaAFactura,
  fetchPrimeraSerieActiva,
  fetchUsoCfdiProforma,
} from "@/features/proformas/services/convertirAFactura";
import { queryKeys } from "@/lib/query";
import { scopeDePayload, usePayloadRequestId } from "@/lib/idempotency";

export interface ConvertirDirectoInput {
  proformaIds: string[];
  organizationId: string;
  fiscal?: boolean;
  /**
   * Plazo de crédito explícito. `null`/`undefined` deja que la RPC aplique la
   * cascada proforma → ficha del cliente → 0 (v13.331.9).
   */
  diasCredito?: number | null;
}

export function useConvertirProformaDirecto() {
  const qc = useQueryClient();
  const solicitud = usePayloadRequestId();

  const mutation = useMutation({
    mutationKey: queryKeys.proformas.convertirDirecto,
    mutationFn: async (input: ConvertirDirectoInput) => {
      if (!input.proformaIds.length) {
        throw new Error("Selecciona al menos una proforma");
      }
      const [serie, usoCfdi] = await Promise.all([
        fetchPrimeraSerieActiva(input.organizationId),
        fetchUsoCfdiProforma(input.proformaIds[0], input.organizationId),
      ]);
      if (!serie) {
        throw new Error(
          "Esta organización no tiene series de facturación activas. Crea una en Configuración → Facturación antes de continuar.",
        );
      }
      return convertirProformaAFactura({
        proformaIds: input.proformaIds,
        serieId: serie.id,
        metodoPago: "PPD",
        formaPago: "99",
        usoCfdi,
        diasCredito: input.diasCredito ?? null,
        notas: null,
        requestId: solicitud.get(scopeDePayload([
          input.organizationId, serie.id, input.diasCredito, usoCfdi, ...[...input.proformaIds].sort(),
        ])),
      });
    },
    onSuccess: async (res, input) => {
      solicitud.reset();
      const monedas = res.map((r) => r.moneda).join(" y ");
      if (input.fiscal) {
        toast({
          title: res.length === 1 ? "Borrador fiscal generado" : `Se generaron ${res.length} borradores fiscales`,
          description: `Consulta los borradores en Facturación (${monedas}).`,
        });
      } else if (res.length > 1) {
        toast({
          title: `Se generaron ${res.length} borradores`,
          description: `Uno por cada moneda (${monedas}). El SAT no permite CFDI multi-moneda; revisa y timbra cada borrador en Facturación.`,
        });
      } else {
        const r = res[0];
        toast({
          title: "Borrador de factura generado",
          description: `Borrador ${r.facturaNumero.startsWith("BORRADOR-") ? "sin folio" : r.facturaNumero} (${r.moneda}) listo. El folio interno se asignará al timbrar.`,
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.proformas.all }),
        qc.invalidateQueries({ queryKey: queryKeys.facturas.all }),
        qc.invalidateQueries({ queryKey: queryKeys.embarques.fullRoot }),
        qc.invalidateQueries({ queryKey: queryKeys.embarques.conceptosVenta() }),
        qc.invalidateQueries({ queryKey: queryKeys.facturacion.bandejaPrefix() }),
      ]);
    },
    onError: (err) =>
      notifyError(undefined, { error: err, title: "Convertir proforma a factura" }),
  });

  return {
    convertir: mutation.mutate,
    isPending: mutation.isPending,
  };
}
