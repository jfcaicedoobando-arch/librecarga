import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgFilter } from '@/hooks/shared/useOrgFilter';
import { consultarAprobacionMargen, solicitarAprobacionMargen, aprobarMargen, type AprobacionMargen } from '../services/aprobacionMargen';
import { getErrorMessage } from '@/lib/errors';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/ui/appFeedback';
import { isExpectedTelemetryError } from '@/lib/observability/expectedTelemetryError';
import { embarques } from '../queryKeys';

export function useAprobacionMargen(id: string, enabled: boolean) {
  const { user, effectiveRole } = useAuth();
  const { organizationId, orgListo } = useOrgFilter();
  const client = useQueryClient();
  const key = ['embarque-aprobacion-margen', organizationId, user?.id, effectiveRole, id];
  const query = useQuery({
    queryKey: key, queryFn: () => consultarAprobacionMargen(id), enabled: enabled && orgListo, retry: false,
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (input: { snapshot?: AprobacionMargen['snapshot']; motivo?: string }) => input.snapshot
      ? aprobarMargen(id, input.snapshot, input.motivo ?? '') : solicitarAprobacionMargen(id),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: embarques.etiquetasMargenRoot });
      notifySuccess(undefined, { title: data?.estado === 'aprobada' ? 'Margen aprobado' : 'Solicitud registrada' });
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      if (isExpectedTelemetryError(error)) {
        notifyWarning(undefined, { title: 'No se pudo completar la aprobación', description: message });
      } else notifyError(undefined, { title: 'No se pudo completar la aprobación', error });
      void query.refetch();
    },
  });
  return { query, mutation };
}
