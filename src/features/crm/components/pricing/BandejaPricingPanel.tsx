/**
 * Bandeja de Pricing: solicitudes enviadas desde el CRM, ordenadas por
 * vencimiento. Vive como pestaña dentro de `/costeo/tarifas?tab=bandeja`
 * (el aviso de la campanita llega con `?id=` y la ruta legacy redirige aquí).
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import PaginationControls from "@/components/shared/PaginationControls";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBandejaPricing, useSolicitudPricing } from "@/features/crm/hooks/usePricingCrm";
import { PAGINA_PRICING } from "@/features/crm/services/pricing/pricingCrm";
import { DESCRIPCION_PLAZOS_MODO } from "@/features/crm/services/pricing/modoPricing";
import { ETIQUETA_ESTADO_PRICING, type SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { RelojPricing } from "@/features/crm/components/pricing/RelojPricing";
import { estaVencida } from "@/features/crm/services/pricing/estadosPricing";
import { esGerenteOps } from "@/features/crm/services/pricing/plazoPricing";
import { useAuth } from "@/lib/contexts/AuthContext";
import { ModosEjecutivoPanel } from "@/features/crm/components/pricing/ModosEjecutivoPanel";
import { TabsModoPricing } from "@/features/crm/components/pricing/TabsModoPricing";
import { useModoPropioPricing } from "@/features/crm/hooks/useFlujoPricing";
import { SolicitudPricingDetalle } from "@/features/crm/components/pricing/SolicitudPricingDetalle";

const ESTADOS = [
  { value: "abiertas", label: "Por responder" }, { value: "info_requerida", label: "Información requerida" },
  { value: "respondida", label: "Respondidas" }, { value: "sin_opcion", label: "Sin opción" },
  { value: "cancelada", label: "Canceladas" }, { value: "todos", label: "Todas" },
];
const MENSAJES_VACIOS: Record<string, string> = {
  abiertas: "No hay solicitudes por responder.",
  info_requerida: "No hay solicitudes esperando información.",
  sin_opcion: "No hay solicitudes cerradas sin opción.",
  respondida: "No hay solicitudes respondidas.",
  cancelada: "No hay solicitudes canceladas.",
  todos: "Aún no hay solicitudes de Pricing.",
};

function DetalleDeSolicitud({ id }: { id: string }) {
  const detalle = useSolicitudPricing(id);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, [id]);

  return (
    <section id="detalle-solicitud-pricing" aria-labelledby="titulo-solicitud-pricing" className="space-y-3">
      <h2 ref={titulo} id="titulo-solicitud-pricing" tabIndex={-1} className="text-subsection">
        Detalle de la solicitud
      </h2>
      {detalle.isLoading ? (
        <div role="status"><EmptyStateInline loading message="Cargando el detalle de la solicitud…" /></div>
      ) : detalle.isError ? (
        <ErrorStateInline
          message="No se pudo cargar el detalle de la solicitud."
          onRetry={() => void detalle.refetch()}
          retrying={detalle.isFetching}
        />
      ) : detalle.data ? (
        <SolicitudPricingDetalle key={detalle.data.id} solicitud={detalle.data} />
      ) : (
        <EmptyStateInline message="La solicitud no está disponible o ya no tienes acceso." />
      )}
    </section>
  );
}

function paginaDesdeUrl(valor: string | null) {
  if (valor === null) return 0;
  const numero = Number(valor);
  return /^\d+$/.test(valor) && Number.isSafeInteger(numero)
    && numero < Math.floor(Number.MAX_SAFE_INTEGER / PAGINA_PRICING) ? numero : null;
}

function FilaSolicitud({ solicitud, activa, onClick }: {
  solicitud: SolicitudPricingRow;
  activa: boolean;
  onClick: () => void;
}) {
  const { folio, estado, cliente, servicio, origen, pol, destino, pod, enviada_at, vence_at, respondida_at } = solicitud;
  return (
    <button type="button" onClick={onClick} aria-expanded={activa}
      aria-controls={activa ? "detalle-solicitud-pricing" : undefined}
      className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 aria-expanded:border-primary">
      <span className="font-medium">{folio}</span>
      <Badge variant="outline">{ETIQUETA_ESTADO_PRICING[estado] ?? estado}</Badge>
      <span className="text-body-sm">{cliente ?? "Sin cliente"}</span>
      <span className="text-body-sm text-muted-foreground">{[servicio, origen ?? pol, destino ?? pod].filter(Boolean).join(" · ")}</span>
      {estaVencida(solicitud, new Date()) && <Badge variant="destructive">Vencida</Badge>}
      <span className="ml-auto"><RelojPricing enviadaAt={enviada_at} venceAt={vence_at} respondidaAt={respondida_at}
        cancelada={estado === "cancelada" || estado === "sin_opcion"} pausada={estado === "info_requerida"} /></span>
    </button>
  );
}

function ResultadosBandeja({ consulta, id, total, paginas, pagina, corrigiendoPagina, onDetalle, onPagina, estado, onVerTodas }: {
  consulta: ReturnType<typeof useBandejaPricing>;
  id: string | null;
  total: number;
  paginas: number;
  pagina: number;
  corrigiendoPagina: boolean;
  onDetalle: (id: string | null) => void;
  onPagina: (pagina: number) => void;
  estado: string;
  onVerTodas: () => void;
}) {
  if (consulta.error) {
    return <ErrorStateInline message="No se pudieron cargar las solicitudes." onRetry={() => void consulta.refetch()} />;
  }
  if (consulta.isPlaceholderData) {
    return <div role="status"><EmptyStateInline loading message="Actualizando solicitudes…" /></div>;
  }
  if (consulta.isLoading || corrigiendoPagina) return <EmptyStateInline loading message="Cargando solicitudes…" />;
  if (total === 0) return (
    <EmptyStateInline message={MENSAJES_VACIOS[estado] ?? "No hay solicitudes con este estado."}
      action={estado !== "todos" ? { label: "Ver todas las solicitudes", onClick: onVerTodas } : undefined} />
  );

  return (
    <>
      <div className="space-y-2">
        {consulta.data?.filas.map((solicitud) => (
          <FilaSolicitud key={solicitud.id} solicitud={solicitud} activa={id === solicitud.id}
            onClick={() => onDetalle(id === solicitud.id ? null : solicitud.id)} />
        ))}
      </div>
      <PaginationControls page={pagina} totalPages={paginas} total={total} pageSize={PAGINA_PRICING} onPageChange={onPagina} />
    </>
  );
}

export function BandejaPricingPanel() {
  const [params, setParams] = useSearchParams();
  const { effectiveRole } = useAuth();
  const estado = params.get("estado") ?? "abiertas";
  const modoPropio = useModoPropioPricing();
  const modo = params.get("modo") ?? modoPropio;
  const indice = paginaDesdeUrl(params.get("p"));
  const pagina = indice ?? 0;
  const id = params.get("id");
  const consulta = useBandejaPricing(estado, pagina, modo);
  const { data, isPlaceholderData, error } = consulta;
  const cambiar = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v == null) n.delete(k); else n.set(k, v);
    if (k === "estado" || k === "modo") n.delete("p");
    setParams(n, { replace: true });
  };
  const puedeConfigurar = esGerenteOps(effectiveRole);
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / PAGINA_PRICING));
  const paginaDisponible = data && !isPlaceholderData && !error ? Math.min(pagina, paginas - 1) : pagina;
  useEffect(() => {
    if (indice !== null && pagina === paginaDisponible) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (paginaDisponible === 0) next.delete("p");
      else next.set("p", String(paginaDisponible));
      return next;
    }, { replace: true });
  }, [indice, pagina, paginaDisponible, setParams]);

  return (
    <>
      <PageHeader title="Bandeja de pricing" description={DESCRIPCION_PLAZOS_MODO} />
      {puedeConfigurar && <ModosEjecutivoPanel />}
      <TabsModoPricing valor={modo} onCambiar={(v) => cambiar("modo", v)} />
      <Select value={estado} onValueChange={(v) => cambiar("estado", v)}>
        <SelectTrigger className="w-48" aria-label="Estado de la solicitud"><SelectValue /></SelectTrigger>
        <SelectContent>{ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
      </Select>
      {id && <DetalleDeSolicitud id={id} />}
      <ResultadosBandeja consulta={consulta} id={id} total={total} paginas={paginas} pagina={paginaDisponible}
        estado={estado} onVerTodas={() => cambiar("estado", "todos")}
        corrigiendoPagina={pagina !== paginaDisponible} onDetalle={(solicitudId) => cambiar("id", solicitudId)}
        onPagina={(p) => cambiar("p", String(p))} />
    </>
  );
}
