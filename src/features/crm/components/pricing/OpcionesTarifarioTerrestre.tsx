/** Tarifas terrestres guardadas que coinciden con la solicitud (sólo consulta). */
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { formatCurrency } from "@/lib/formatters/numbers";
import { formatDate } from "@/lib/formatters/dates";
import { useTarifasTerrestresSugeridas } from "@/features/crm/hooks/useTarifasTerrestresSugeridas";
import { criterioTerrestre } from "@/features/crm/services/pricing/tarifasTerrestresSugeridas";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

export function OpcionesTarifarioTerrestre({ solicitud: s, puedeCotizar }: { solicitud: SolicitudPricingRow; puedeCotizar: boolean }) {
  const navigate = useNavigate();
  const criterio = criterioTerrestre(s);
  const q = useTarifasTerrestresSugeridas(s.organization_id, criterio, s.fecha_tentativa_carga);
  const cotizar = (tarifaId: string) => {
    // Mismo parámetro que aéreo: el prefill multimodo valida que tarifa y solicitud sean del mismo modo.
    const p = new URLSearchParams({ tarifaAerea: tarifaId, solicitud: s.id });
    if (s.oportunidad_id) p.set("oportunidad", s.oportunidad_id);
    navigate(`/cotizaciones/nueva?${p.toString()}`);
  };
  if (s.estado === "cancelada") return null;
  const unidad = (sub: string) => (sub === "LTL" ? "por kg" : "por viaje");
  return (
    <div className="space-y-2">
      <SectionHeading as="h3">Tarifas terrestres del tarifario</SectionHeading>
      {!criterio ? (
        <EmptyStateInline message="Elige submodalidad, origen y destino para ver tarifas terrestres." />
      ) : q.isLoading ? (
        <p role="status" className="text-body-sm text-muted-foreground">Consultando el tarifario…</p>
      ) : q.isError ? (
        <ErrorStateInline title="No se pudo consultar el tarifario" message="Reintenta para recuperar las tarifas."
          onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyStateInline message={`No hay tarifas terrestres ${s.submodalidad} vigentes ${s.pol ?? ""} → ${s.pod ?? ""}.`} />
      ) : (q.data ?? []).map((t) => (
        <Card key={t.id}>
          <CardContent className="grid gap-2 p-4 text-body-sm md:grid-cols-4">
            <div><span className="text-muted-foreground">Ruta: </span>{t.origen} → {t.destino}<br />
              <span className="text-muted-foreground">Servicio: </span>{t.submodalidad}{t.tipo_unidad ? ` · ${t.tipo_unidad}` : ""}</div>
            <div><span className="text-muted-foreground">Linehaul: </span>{formatCurrency(t.flete_base, t.moneda)} {unidad(t.submodalidad)}<br />
              <span className="text-muted-foreground">Mínimo: </span>{t.minimo == null ? "—" : formatCurrency(t.minimo, t.moneda)}</div>
            <div><span className="text-muted-foreground">Tránsito: </span>{t.transit_time_dias == null ? "—" : `${t.transit_time_dias} días`}</div>
            <div><span className="text-muted-foreground">Vigencia hasta: </span>{formatDate(t.vigente_hasta)}</div>
            {puedeCotizar && (
              <div className="md:col-span-4"><Button size="sm" onClick={() => cotizar(t.id)}>Cotizar con esta tarifa</Button></div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
