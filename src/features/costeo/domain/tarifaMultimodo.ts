import type { TramoPeso } from "./tarifaPorPeso";

export type ModoNoMaritimo = "Aéreo" | "Terrestre";
export const SUBMODALIDADES_TERRESTRE = ["FTL", "LTL", "Arrastre"] as const;
export const TIPOS_UNIDAD = ["Caja seca 53'", "Thorton", "Rabón", "Plataforma", "Refrigerada"] as const;
/** Monedas que la cotización sabe convertir con el TC DOF. */
export const MONEDAS_TARIFA_MULTIMODO = ["USD", "MXN"] as const;
export type MonedaTarifaMultimodo = (typeof MONEDAS_TARIFA_MULTIMODO)[number];
export const TRAMOS_AEREOS_SUGERIDOS = [45, 100, 300, 500, 1000];

export interface TarifaMultimodoForm {
  modo: ModoNoMaritimo; agente_id: string; moneda: MonedaTarifaMultimodo;
  origen: string; destino: string; aerolinea: string;
  submodalidad: string; tipo_unidad: string;
  flete_base: number; minimo: number | null;
  vigente_desde: string; vigente_hasta: string; transit_time_dias: number | null;
  tramos: TramoPeso[];
  /** Aéreo: aeropuertos IATA de conexión separados por coma; vacío = directo. */
  escalas?: string;
  /** Cuando la tarifa responde una solicitud de Pricing. */
  solicitud_pricing_id?: string | null;
}

/** Escalas capturadas como "LAX, ANC" → ["LAX","ANC"]. */
export function escalasLista(t: string | undefined): string[] {
  return (t ?? "").split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

const CP = /^\d{5}$/;
const IATA = /^[A-Z0-9]{3}$/;

/** Usa tramos de peso: aéreo y terrestre LTL. */
export function usaTramos(f: Pick<TarifaMultimodoForm, "modo" | "submodalidad">): boolean {
  return f.modo === "Aéreo" || f.submodalidad === "LTL";
}

function validarRutaAerea(f: TarifaMultimodoForm, faltantes: string[]) {
  if (!IATA.test(f.origen)) faltantes.push("Aeropuerto de origen (IATA)");
  if (!IATA.test(f.destino)) faltantes.push("Aeropuerto de destino (IATA)");
  if (f.origen && f.origen === f.destino) faltantes.push("Origen y destino distintos");
  const escalas = escalasLista(f.escalas);
  if (escalas.length > 3 || escalas.some((escala) => !IATA.test(escala))) faltantes.push("Escalas (hasta 3 códigos IATA)");
}

export function faltantesTarifaMultimodo(f: TarifaMultimodoForm): string[] {
  const out: string[] = [];
  if (!f.agente_id) out.push("Agente");
  if (f.modo === "Aéreo") {
    validarRutaAerea(f, out);
  } else {
    if (!f.submodalidad) out.push("Submodalidad");
    if (!f.origen.trim()) out.push("Origen (CP o ciudad)");
    if (!f.destino.trim()) out.push("Destino (CP o ciudad)");
  }
  if (!(f.flete_base >= 0)) out.push("Flete base");
  if (!f.vigente_desde || !f.vigente_hasta || f.vigente_hasta < f.vigente_desde) out.push("Vigencia");
  const desdes = f.tramos.map((t) => t.desde_kg);
  if (new Set(desdes).size !== desdes.length) out.push("Rangos de peso repetidos");
  if (f.tramos.some((t) => t.desde_kg < 0 || t.precio < 0)) out.push("Rangos con valores negativos");
  return out;
}

function lugar(valor: string): { cp: string | null; ciudad: string | null } {
  const v = valor.trim();
  return CP.test(v) ? { cp: v, ciudad: null } : { cp: null, ciudad: v || null };
}

/** Payload para `crear_tarifa_con_recargos_rpc`. */
export function payloadTarifaMultimodo(f: TarifaMultimodoForm): Record<string, unknown> {
  const base = {
    modo: f.modo, agente_id: f.agente_id, moneda: f.moneda, flete_base: f.flete_base, minimo: f.minimo,
    vigente_desde: f.vigente_desde, vigente_hasta: f.vigente_hasta, transit_time_dias: f.transit_time_dias,
    tramos: usaTramos(f) ? f.tramos : [],
    solicitud_pricing_id: f.solicitud_pricing_id || null,
  };
  if (f.modo === "Aéreo") {
    return { ...base, aeropuerto_origen: f.origen.toUpperCase(), aeropuerto_destino: f.destino.toUpperCase(),
      aerolinea: f.aerolinea || null, unidad_flete: "kg",
      escalas: escalasLista(f.escalas).length ? escalasLista(f.escalas) : null };
  }
  const o = lugar(f.origen); const d = lugar(f.destino);
  return { ...base, submodalidad: f.submodalidad, tipo_unidad: f.tipo_unidad || null,
    origen_cp: o.cp, origen_ciudad: o.ciudad, destino_cp: d.cp, destino_ciudad: d.ciudad,
    unidad_flete: f.submodalidad === "LTL" ? "kg" : "viaje" };
}
