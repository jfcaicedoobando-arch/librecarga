/**
 * Respuesta de una solicitud de pricing: tarifas del catálogo ligadas a ella.
 * Pricing agrega una tarifa por opción con el mismo formulario del catálogo.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NuevaTarifaMultimodoDialog, TarifaForm } from "@/features/costeo";
import { iataDeEtiqueta, textoEscalas } from "@/features/crm/services/pricing/tarifasAereasSugeridas";
import type { TarifaRespuestaRow } from "@/features/crm/services/pricing/tarifasRespuesta";
import { formatCurrency } from "@/lib/formatters/numbers";
import { formatDate } from "@/lib/formatters/dates";
import { NotasTarifa } from "./NotasTarifa";
import { DesgloseRecargos } from "./DesgloseRecargos";

interface Props {
  solicitudId: string;
  editable: boolean;
  hayOpcionesViejas: boolean;
  tarifas: TarifaRespuestaRow[];
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  onSaved: () => void;
  onCotizar?: (tarifaId: string) => void;
  /** Solicitud aérea: "Agregar tarifa" abre el formulario aéreo con la ruta IATA. */
  aereo?: { pol: string | null; pod: string | null };
  /** Terrestre: abre el formulario terrestre con la ruta de la solicitud. */
  terrestre?: { submodalidad: string | null; origen: string | null; destino: string | null; tipoUnidad: string | null };
}

const carta = (v: boolean | null) => (v === true ? "Sí" : v === false ? "No" : "—");
const moneda = (n: number, m: string) =>
  formatCurrency(Number(n) || 0, m || "USD");

function AccionCotizarRespuesta({ tarifaId, onCotizar }: { tarifaId: string; onCotizar?: Props["onCotizar"] }) {
  if (!onCotizar) return null;
  return (
    <div className="col-span-2 md:col-span-4">
      <Button size="sm" onClick={() => onCotizar(tarifaId)}>Cotizar con esta opción</Button>
    </div>
  );
}

function textoRuta(ruta: TarifaRespuestaRow["ruta"]) {
  return `${ruta?.origen?.name ?? "—"} → ${ruta?.destino?.name ?? "—"}`;
}

function FilaTarifa({ t, n, onCotizar }: { t: TarifaRespuestaRow; n: number; onCotizar?: Props["onCotizar"] }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-2 p-4 text-body-sm md:grid-cols-4">
        <div className="col-span-2 font-medium md:col-span-4">Opción {n}</div>
        <div><span className="text-muted-foreground">Agente: </span>{t.agente?.nombre ?? "—"}</div>
        <div><span className="text-muted-foreground">Carrier: </span>{t.naviera?.name ?? t.aerolinea ?? "—"}</div>
        {t.unidad_flete === "kg" && <div><span className="text-muted-foreground">Vuelo: </span>{textoEscalas(t.escalas)}</div>}
        <div><span className="text-muted-foreground">Ruta: </span>{textoRuta(t.ruta)}</div>
        <div><span className="text-muted-foreground">Contenedor: </span>{t.tipo?.code ?? "—"}</div>
        <div><span className="text-muted-foreground">Flete: </span>{moneda(t.flete_base, t.moneda)} {t.unidad_flete ?? ""}</div>
        <div><span className="text-muted-foreground">Tránsito: </span>{t.transit_time_dias != null ? `${t.transit_time_dias} días` : "—"}</div>
        <div><span className="text-muted-foreground">Carta garantía: </span>{carta(t.carta_garantia)}</div>
        <div><span className="text-muted-foreground">Vigente hasta: </span>{t.vigente_hasta ? formatDate(t.vigente_hasta) : "—"}</div>
        <DesgloseRecargos recargos={t.recargos} />
        <NotasTarifa notas={t.notas} />
        <AccionCotizarRespuesta tarifaId={t.id} onCotizar={onCotizar} />
      </CardContent>
    </Card>
  );
}

function AltaTarifaRespuesta({ solicitudId, onSaved, aereo, terrestre, onOpenChange }: Pick<
  Props, "solicitudId" | "onSaved" | "aereo" | "terrestre"
> & { onOpenChange: (open: boolean) => void }) {
  if (aereo) {
    return (
      <NuevaTarifaMultimodoDialog open onOpenChange={onOpenChange} onSaved={onSaved}
        inicial={{ solicitud_pricing_id: solicitudId, origen: iataDeEtiqueta(aereo.pol) ?? "", destino: iataDeEtiqueta(aereo.pod) ?? "" }} />
    );
  }
  if (terrestre) {
    return (
      <NuevaTarifaMultimodoDialog open onOpenChange={onOpenChange} onSaved={onSaved}
        inicial={{ modo: "Terrestre", solicitud_pricing_id: solicitudId, submodalidad: terrestre.submodalidad ?? "",
          origen: terrestre.origen ?? "", destino: terrestre.destino ?? "", tipo_unidad: terrestre.tipoUnidad ?? "" }} />
    );
  }
  return (
    <TarifaForm open onOpenChange={onOpenChange} onSaved={onSaved}
      initial={{ solicitud_pricing_id: solicitudId, carta_garantia: null, unidad_flete: null }} />
  );
}

export function TarifasRespuestaPricing({ solicitudId, editable, hayOpcionesViejas, tarifas, isLoading, isError, isFetching, onSaved, onCotizar, aereo, terrestre }: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="space-y-3">
      {tarifas.map((t, i) => <FilaTarifa key={t.id} t={t} n={i + 1} onCotizar={onCotizar} />)}
      {isLoading && <p role="status" className="text-body-sm text-muted-foreground">Cargando tarifas de respuesta…</p>}
      {isError && <ErrorStateInline title="No se pudieron cargar las tarifas de respuesta" message="Reintenta para ver las opciones de Pricing."
        onRetry={onSaved} retrying={isFetching} />}
      {tarifas.length === 0 && !hayOpcionesViejas && !editable && !isLoading && !isError && (
        <p className="text-body-sm text-muted-foreground">Pricing aún no agrega tarifas.</p>
      )}
      {editable && (
        <Button variant="outline" onClick={() => setAbierto(true)}>
          <Plus className="mr-1 size-4" /> Agregar tarifa
        </Button>
      )}
      {abierto && (
        <AltaTarifaRespuesta solicitudId={solicitudId} onOpenChange={setAbierto}
          onSaved={onSaved} aereo={aereo} terrestre={terrestre} />
      )}
    </div>
  );
}
