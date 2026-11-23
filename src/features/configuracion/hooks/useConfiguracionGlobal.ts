import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query";
import {
  fetchConfiguracionGlobal,
  updateConfiguracionGlobalItems,
  type ConfigGlobalItem,
} from "@/features/configuracion/services";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";

export type { ConfigGlobalItem };

export function useConfiguracionGlobal() {
  return useQuery<ConfigGlobalItem[]>({
    queryKey: queryKeys.configuracionGlobal.all,
    queryFn: fetchConfiguracionGlobal,
    staleTime: 5 * 60 * 1000,
  });
}


export function filtrarConfigGlobalCategoria(data: ConfigGlobalItem[], categoria: string): Record<string, unknown> {
  return Object.fromEntries(data.filter((item) => item.categoria === categoria)
    .map((item) => [item.clave, item.valor]));
}

export function useUpdateConfiguracionGlobal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateConfiguracionGlobalItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configuracionGlobal.all });
      notifySuccess(undefined, { title: "Configuración global guardada" });
    },
    onError: (error: Error) => {
      notifyError(undefined, { title: "Error al guardar", description: getErrorMessage(error),
        error, method: "UPDATE_GLOBAL_CONFIGURATION" });
    },
  });
}
