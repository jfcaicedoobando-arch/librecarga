import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/contexts/AuthContext";
import { captureAuthDataScope, AuthOperationChangedError } from "@/lib/auth/authOperationScope";
import { queryKeys } from "@/lib/query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { aprobarAjusteConsolidacion, consolidarProformas } from "../services/consolidar";

export function useConsolidarProformasFiscales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof consolidarProformas>[0]) => {
      const scope = captureAuthDataScope();
      if (scope.organizationId !== params.organizationId) throw new AuthOperationChangedError();
      const proforma = await consolidarProformas(params);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.proformas.all }),
        qc.invalidateQueries({ queryKey: queryKeys.embarques.fullRoot }),
        qc.invalidateQueries({ queryKey: queryKeys.embarques.conceptosVenta() }),
        qc.invalidateQueries({ queryKey: queryKeys.facturacion.bandejaPrefix() }),
      ]);
      scope.assertCurrent();
      return proforma;
    },
    onError: (error) => notifyError(undefined, { title: "Consolidar proformas", error }),
  });
}

export function useAprobarAjusteConsolidacion(organizationId: string) {
  const { effectiveRole, orgRole, role } = useAuth();
  const rol = orgRole ?? effectiveRole ?? role;
  const puedeAprobar = rol === "admin" || rol === "admin_org" || rol === "contador";
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ proformaId, huella }: { proformaId: string; huella: string }) => {
      const scope = captureAuthDataScope();
      if (scope.organizationId !== organizationId) throw new AuthOperationChangedError();
      await aprobarAjusteConsolidacion(proformaId, huella);
      await qc.invalidateQueries({ queryKey: queryKeys.proformas.all });
      scope.assertCurrent();
    },
    onSuccess: () => notifySuccess(undefined, { title: "Ajuste de consolidación aprobado" }),
    onError: (error) => notifyError(undefined, { title: "Aprobar ajuste de consolidación", error }),
  });
  return { puedeAprobar, aprobar: mutation.mutate, isPending: mutation.isPending };
}
