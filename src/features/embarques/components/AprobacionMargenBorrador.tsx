import { useState } from 'react';
import { ShieldCheck, Send, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAprobacionMargen } from '../hooks/useAprobacionMargen';
import { AprobarMargenBorradorDialog } from './AprobarMargenBorradorDialog';
import { MargenBorradorResumen } from './MargenBorradorResumen';
import { usePermissions } from '@/hooks/shared/usePermissions';
import type { AprobacionMargen } from '../services/aprobacionMargen';

export function AprobacionMargenBorrador({ id, estado, canEdit }: { id: string; estado: string; canEdit: boolean }) {
  const { canViewCosts, isOperador } = usePermissions();
  const enabled = (estado === 'Borrador' || estado === 'Cotización') && (canViewCosts || isOperador);
  const { query, mutation } = useAprobacionMargen(id, enabled);
  const [revision, setRevision] = useState<AprobacionMargen | null>(null);
  if (!enabled) return null;
  if (query.isError) return <section className="flex flex-wrap items-center gap-3 border-y py-3 text-body-sm text-warning">
    No se pudo consultar la aprobación del margen.
    <Button variant="outline" size="sm" onClick={() => void query.refetch()}><RotateCw className="mr-2 h-4 w-4" /> Reintentar</Button>
  </section>;
  const data = query.data;
  if (!data || data.estado === 'no_requerida') return null;
  const aprobada = data.estado === 'aprobada';
  return <section className="space-y-3 border-y py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-subsection">{aprobada ? 'Margen aprobado por Administración' : 'Margen pendiente de aprobación'}</h2>
      {canEdit && data.estado === 'sin_solicitar' && <Button variant="outline" size="sm" loading={mutation.isPending}
        onClick={() => mutation.mutate({})}><Send className="mr-2 h-4 w-4" /> Solicitar aprobación</Button>}
      {data.puede_aprobar && data.estado === 'pendiente' && <Button variant="outline" size="sm"
        disabled={!data.snapshot.calculable} onClick={() => setRevision(data)}><ShieldCheck className="mr-2 h-4 w-4" /> Aprobar margen</Button>}
    </div>
    <MargenBorradorResumen snapshot={data.snapshot} />
    {!data.snapshot.calculable && <p className="text-body-sm text-warning">Falta venta o un tipo de cambio para calcular el margen.</p>}
    {revision && <AprobarMargenBorradorDialog data={revision} busy={mutation.isPending} onClose={() => setRevision(null)}
      onApprove={(motivo) => mutation.mutate({ snapshot: revision.snapshot, motivo }, { onSuccess: () => setRevision(null) })} />}
  </section>;
}
