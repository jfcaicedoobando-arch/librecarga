/** Versiones anteriores de la respuesta de Pricing (sólo lectura). */
import { Badge } from "@/components/ui/badge";
import { listaRegistros as lista, resumenOpcion, resumenTarifa } from "@/features/crm/services/pricing/versionesPricing";
import { formatDateTimeShort } from "@/lib/formatters/dates";
import { useVersionesPricing } from "@/features/crm/hooks/useRecotizarPricing";
import type { VersionPricingRow } from "@/features/crm/services/pricing/recotizarPricing";

function Version({ v }: { v: VersionPricingRow }) {
  const opciones = lista(v.opciones);
  const tarifas = lista(v.tarifas);
  return (
    <li className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Versión {v.version}</Badge>
        <span className="text-caption text-muted-foreground">Recotizada el {formatDateTimeShort(v.created_at)}</span>
      </div>
      <p className="text-body-sm"><span className="text-muted-foreground">Motivo: </span>{v.motivo}</p>
      {opciones.length + tarifas.length === 0 && <p className="text-body-sm text-muted-foreground">Sin opciones guardadas.</p>}
      <ul className="list-disc pl-5 text-body-sm">
        {opciones.map((o, i) => <li key={`o${i}`}>{resumenOpcion(o)}</li>)}
        {tarifas.map((t, i) => <li key={`t${i}`}>{resumenTarifa(t)}</li>)}
      </ul>
    </li>
  );
}

export function VersionesPricing({ solicitudId, version }: { solicitudId: string; version: number }) {
  const consulta = useVersionesPricing(solicitudId, version > 1);
  if (version <= 1) return null;
  return (
    <section aria-label="Versiones anteriores" className="space-y-2">
      <h3 className="text-subsection">Versiones anteriores</h3>
      {consulta.isLoading && <p role="status" className="text-body-sm">Cargando versiones…</p>}
      {consulta.isError && <p className="text-body-sm text-destructive">No se pudieron cargar las versiones anteriores.</p>}
      <ul className="space-y-2">{(consulta.data ?? []).map((v) => <Version key={v.id} v={v} />)}</ul>
    </section>
  );
}
