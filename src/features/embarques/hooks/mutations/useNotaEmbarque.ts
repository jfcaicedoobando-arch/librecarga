/**
 * Mutation: crear nota en el embarque.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';
import { insertarNotaEmbarque } from '@/features/embarques/services';
import { notifyError, notifySuccess } from '@/lib/ui/appFeedback';
import { getErrorMessage } from "@/lib/errors";
import type { captureAuthOperationScope } from "@/lib/auth/authOperationScope";

type CrearNotaInput = {
  embarqueId: string;
  contenido: string;
  usuario: string;
  authScope: ReturnType<typeof captureAuthOperationScope>;
};

export function useCreateNotaEmbarque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ embarqueId, contenido, usuario, authScope }: CrearNotaInput) =>
      insertarNotaEmbarque(embarqueId, contenido, usuario, authScope),
    onSuccess: (_resultado, vars) => {
      if (!vars.authScope.isCurrent()) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.embarques.notas(vars.embarqueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.embarques.actividad(vars.embarqueId) });
      notifySuccess(undefined, { title: "Nota agregada" });
    },
    onError: (error: Error, vars) => {
      if (!vars.authScope.isCurrent()) return;
      notifyError(undefined, { title: "No se pudo agregar nota", description: getErrorMessage(error), error, method: "CREATE_NOTA_EMBARQUE" });
    },
  });
}
