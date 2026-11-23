import { Badge } from '@/components/ui/badge';
import { Hint } from '@/components/shared/Hint';
import { formatFechaHora } from '@/lib/formatters/dates';
import type { EtiquetaMargen } from '../services/etiquetasMargen';

export function EtiquetaMargenBajo({ data, detalle = false }: { data?: EtiquetaMargen; detalle?: boolean }) {
  if (!data) return null;
  const autor = data.autorizada_email || data.autorizada_por;
  const fecha = data.autorizada_at ? formatFechaHora(data.autorizada_at, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : null;
  const descripcion = data.vigente && autor
    ? `Autorizó: ${autor}${fecha ? ` · ${fecha}` : ''}`
    : 'Autorización pendiente o importes modificados';
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <Hint label={descripcion}><Badge variant="warning">Margen bajo</Badge></Hint>
    {detalle && <p className="min-w-0 break-words text-body-sm text-muted-foreground">{descripcion}</p>}
  </div>;
}