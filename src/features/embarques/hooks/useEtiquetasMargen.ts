import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgFilter } from '@/hooks/shared/useOrgFilter';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { consultarEtiquetasMargen } from '../services/etiquetasMargen';
import { embarques } from '../queryKeys';

export function useEtiquetasMargen(ids: string[]) {
  const { user, effectiveRole } = useAuth();
  const { organizationId, orgListo } = useOrgFilter();
  const { canViewCosts, isOperador } = usePermissions();
  return useQuery({
    queryKey: embarques.etiquetasMargen(organizationId, user?.id, effectiveRole, ids),
    queryFn: () => consultarEtiquetasMargen(ids),
    enabled: orgListo && ids.length > 0 && (canViewCosts || isOperador),
    retry: false, staleTime: 0,
  });
}