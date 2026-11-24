/**
 * Datos capturados por el solicitante, sólo lectura.
 */
import { Card, CardContent } from "@/components/ui/card";
import { formatFechaDia } from "@/lib/formatters/dates";
import { useUsuariosOrgCrm } from "@/features/crm/hooks/usePricingCrm";
import { horasPlazo } from "@/features/crm/services/pricing/modoPricing";
import { ETIQUETA_COMPLEJIDAD, ETIQUETA_TIPO_SOLICITUD, UNIDADES_MEDIDA_PRICING, type ComplejidadPricing, type SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

const siNo = (v: boolean | null) => (v == null ? null : v ? "Sí" : "No");

function etiquetaPlazo(s: SolicitudPricingRow): string {
  const base = ETIQUETA_COMPLEJIDAD[s.complejidad as ComplejidadPricing] ?? s.complejidad;
  const h = horasPlazo(s.complejidad, s.servicio);
  return h == null ? base : `${base} (${h} h hábiles)`;
}

function itemsTerrestre(s: SolicitudPricingRow): Array<[string, string | number | null]> {
  return [["CP de origen", s.origen_cp], ["CP de destino", s.destino_cp], ["Paradas", s.paradas?.join(", ") ?? null],
    ["Cruce fronterizo", siNo(s.cruce_fronterizo)], ["In-bond", siNo(s.in_bond)], ["Tipo de unidad", s.tipo_unidad],
    ["Tarimas", s.tarimas], ["Puerto (arrastre)", s.arrastre_puerto], ["Retorno de vacío", siNo(s.retorno_vacio)],
    ["Sobrepeso", siNo(s.sobrepeso)]];
}

function itemsAereo(s: SolicitudPricingRow): Array<[string, string | null]> {
  return [["Baterías de litio", siNo(s.baterias_litio)], ["Known Shipper", siNo(s.known_shipper)], ["Tipo de avión", s.tipo_aeronave]];
}

const EXTREMOS: Record<string, string> = { "Aéreo": "Aeropuerto", Terrestre: "Ciudad" };

export function ResumenSolicitudPricing({ solicitud: s }: { solicitud: SolicitudPricingRow }) {
  const { data: usuarios = [] } = useUsuariosOrgCrm();
  const solicitante = usuarios.find((u) => u.user_id === s.solicitante_id)?.nombre ?? null;
  const extremo = EXTREMOS[s.servicio ?? ""] ?? "Puerto";
  const campos: Array<[string, string | number | null]> = [
    ["Solicitante", solicitante], ["Fecha", formatFechaDia(s.fecha)], ["Cliente", s.cliente],
    ["Modo de transporte", s.servicio], ["Submodalidad", s.submodalidad], ["Tipo de negocio", s.modalidad_negocio], ["Volumen (CBM)", s.volumen_cbm], ["Clase IMO", s.imo_clase], ["Número UN", s.imo_un], ["Complejidad", etiquetaPlazo(s)],
    ["Tipo de solicitud", s.tipo_solicitud ? ETIQUETA_TIPO_SOLICITUD[s.tipo_solicitud] ?? s.tipo_solicitud : null],
    ["Tipo de operación", s.tipo_operacion], ["Sector económico", s.sector_economico],
    ["Incoterm", s.incoterm], ["IMO", siNo(s.imo)], ...(s.servicio === "Aéreo" ? itemsAereo(s) : []), ["Commodity", s.commodity],
    ["Container Size", s.container_size], ["Tipo de contenedor", s.tipo_carga], ["Quantity", s.cantidad],
    ["Estibable", siNo(s.estibable)], ["Weight", s.peso],
    ["Units of measurement", UNIDADES_MEDIDA_PRICING.find((u) => u.value === s.unidad_medida)?.label ?? s.unidad_medida ?? null],
    ["Dimensions", s.dimensiones],
    ["País de origen", s.origen], [`${extremo} de origen`, s.pol],
    ["País de destino", s.destino], [`${extremo} de destino`, s.pod],
    ...(s.servicio === "Terrestre" ? itemsTerrestre(s) : []),
    ["Fecha tentativa de carga", formatFechaDia(s.fecha_tentativa_carga)], ["Delivery", s.delivery],
  ];
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 py-4 md:grid-cols-4">
        {campos.map(([l, v]) => (
          <div key={l}>
            <p className="text-caption text-muted-foreground">{l}</p>
            <p className="text-body-sm">{v ?? "—"}</p>
          </div>
        ))}
        {s.complejidad_motivo && <Motivo titulo="Motivo del cambio de complejidad" texto={s.complejidad_motivo} />}
        {s.plazo_motivo && <Motivo titulo="Motivo del nuevo plazo" texto={s.plazo_motivo} />}
        {s.notas && (
          <div className="col-span-full">
            <p className="text-caption text-muted-foreground">Notas importantes</p>
            <p className="whitespace-pre-wrap text-body-sm">{s.notas}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Motivo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="col-span-full">
      <p className="text-caption text-muted-foreground">{titulo}</p>
      <p className="whitespace-pre-wrap text-body-sm">{texto}</p>
    </div>
  );
}
