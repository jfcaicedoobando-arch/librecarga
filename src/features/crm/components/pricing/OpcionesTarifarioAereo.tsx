/** Tarifas aéreas guardadas que coinciden con la ruta IATA de la solicitud (sólo consulta). */
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { formatCurrency } from "@/lib/formatters/numbers";
import { formatDate } from "@/lib/formatters/dates";
import { useTarifasAereasSugeridas } from "@/features/crm/hooks/useTarifasAereasSugeridas";
import { iataDeEtiqueta, textoEscalas } from "@/features/crm/services/pricing/tarifasAereasSugeridas";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

export function OpcionesTarifarioAereo({ solicitud: s, puedeCotizar }: { solicitud: SolicitudPricingRow; puedeCotizar: boolean }) {
  const navigate = useNavigate();
  const cotizar = (tarifaId: string) => {
    const q = new URLSearchParams({ tarifaAerea: tarifaId, solicitud: s.id });
    if (s.oportunidad_id) q.set("oportunidad", s.oportunidad_id);
    navigate(`/cotizaciones/nueva?${q.toString()}`);
  };
  const origen = iataDeEtiqueta(s.pol);
  const destino = iataDeEtiqueta(s.pod);
  const q = useTarifasAereasSugeridas(s.organization_id, origen, destino);
  if (s.estado === "cancelada") return null;
  return (
    <div className="space-y-2">
      <SectionHeading as="h3">Tarifas aéreas del tarifario</SectionHeading>
      {!origen || !destino ? (
        <EmptyStateInline message="Elige aeropuerto de origen y destino para ver tarifas aéreas." />
      ) : q.isLoading ? (
        <p role="status" className="text-body-sm text-muted-foreground">Consultando el tarifario…</p>
      ) : q.isError ? (
        <ErrorStateInline title="No se pudo consultar el tarifario" message="Reintenta para recuperar las tarifas."
          onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyStateInline message={`No hay tarifas aéreas vigentes ${origen} → ${destino}.`} />
      ) : (q.data ?? []).map((t) => (
        <Card key={t.id}>
          <CardContent className="grid gap-2 p-4 text-body-sm md:grid-cols-4">
            <div><span className="text-muted-foreground">Ruta: </span>{t.origen} → {t.destino}<br />
              <span className="text-muted-foreground">Aerolínea: </span>{t.aerolinea || "—"}<br />
              <span className="text-muted-foreground">Vuelo: </span>{textoEscalas(t.escalas)}
              {t.transit_time_dias != null && ` · ${t.transit_time_dias} días`}</div>
            <div><span className="text-muted-foreground">Precio por kg: </span>{formatCurrency(t.flete_base, t.moneda)}<br />
              <span className="text-muted-foreground">Mínimo: </span>{t.minimo == null ? "—" : formatCurrency(t.minimo, t.moneda)}</div>
            <div className="md:col-span-1"><span className="text-muted-foreground">Rangos: </span>
              {t.tramos.length === 0 ? "—" : t.tramos.map((r) => `+${r.desde_kg}: ${formatCurrency(r.precio, t.moneda)}`).join(" · ")}</div>
            <div><span className="text-muted-foreground">Vigencia hasta: </span>{formatDate(t.vigente_hasta)}</div>
            {puedeCotizar && (
              <div className="md:col-span-4">
                <Button size="sm" onClick={() => cotizar(t.id)}>Cotizar con esta tarifa</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
