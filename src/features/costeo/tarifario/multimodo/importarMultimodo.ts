/**
 * Carga masiva de tarifas aéreas y terrestres desde CSV/Excel.
 * Lógica pura: convierte renglones en formularios validados con la misma regla
 * que la captura manual (`faltantesTarifaMultimodo`); no toca la base.
 */
import { fechaIso } from "../importarTarifas";
import {
  MONEDAS_TARIFA_MULTIMODO, faltantesTarifaMultimodo, usaTramos,
  type MonedaTarifaMultimodo, type TarifaMultimodoForm,
} from "@/features/costeo/domain/tarifaMultimodo";
import type { TramoPeso } from "@/features/costeo/domain/tarifaPorPeso";

export const ENCABEZADOS_MULTIMODO = [
  "Modo", "Agente", "Moneda", "Origen", "Destino", "Aerolínea", "Escalas", "Submodalidad",
  "Tipo de unidad", "Precio base", "Mínimo", "Inicio vigencia", "Término vigencia", "Días de tránsito",
  "Rangos de peso",
];
export const MAX_FILAS_MULTIMODO = 500;

export interface FilaMultimodo { fila: number; form: TarifaMultimodoForm }
export interface ResultadoMultimodo { tarifas: FilaMultimodo[]; errores: string[] }

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const txt = (v: unknown) => String(v ?? "").trim();

function campo(h: string): string | null {
  const n = norm(h);
  const mapa: [string, string][] = [
    ["modo", "modo"], ["agente", "agente"], ["moneda", "moneda"], ["origen", "origen"], ["destino", "destino"],
    ["aerolinea", "aerolinea"], ["escala", "escalas"], ["submodalidad", "submodalidad"], ["tipo de unidad", "tipo_unidad"],
    ["precio", "flete"], ["minimo", "minimo"], ["inicio", "desde"], ["termino", "hasta"], ["fin", "hasta"],
    ["dias", "dias"], ["rango", "rangos"],
  ];
  return mapa.find(([p]) => n.startsWith(p))?.[1] ?? null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || txt(v) === "") return null;
  const n = typeof v === "number" ? v : Number(txt(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** "45:4.5; 100:3.9" → tramos; null si el texto no se entiende. */
export function rangosPeso(v: unknown): TramoPeso[] | null {
  const t = txt(v);
  if (!t) return [];
  const out: TramoPeso[] = [];
  for (const parte of t.split(/[;|]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(parte.replace(/\s*kg\s*/i, ""));
    if (!m) return null;
    out.push({ desde_kg: Number(m[1]), precio: Number(m[2]) });
  }
  return out.sort((a, b) => a.desde_kg - b.desde_kg);
}

function modo(v: unknown): TarifaMultimodoForm["modo"] | null {
  const n = norm(v);
  if (n === "aereo") return "Aéreo";
  return n === "terrestre" ? "Terrestre" : null;
}

type Agentes = ReadonlyArray<{ id: string; nombre: string }>;

function leerRuta(r: Record<string, unknown>, modoTarifa: TarifaMultimodoForm["modo"]) {
  const origen = txt(r.origen);
  const destino = txt(r.destino);
  if (modoTarifa === "Aéreo") {
    return {
      origen: origen.toUpperCase(), destino: destino.toUpperCase(),
      aerolinea: txt(r.aerolinea), escalas: txt(r.escalas), submodalidad: "", tipo_unidad: "",
    };
  }
  const submodalidad = txt(r.submodalidad).toUpperCase();
  return {
    origen, destino, aerolinea: "", escalas: "",
    submodalidad: submodalidad === "ARRASTRE" ? "Arrastre" : submodalidad,
    tipo_unidad: txt(r.tipo_unidad),
  };
}

function convertir(r: Record<string, unknown>, agentes: Agentes): { form?: TarifaMultimodoForm; error?: string } {
  const m = modo(r.modo);
  if (!m) return { error: "Modo debe ser Aéreo o Terrestre" };
  const agente = agentes.find((a) => norm(a.nombre) === norm(r.agente));
  const moneda = (txt(r.moneda).toUpperCase() || "USD") as MonedaTarifaMultimodo;
  if (!MONEDAS_TARIFA_MULTIMODO.includes(moneda)) return { error: "Moneda debe ser USD o MXN" };
  const flete = numero(r.flete);
  const minimo = numero(r.minimo);
  const dias = numero(r.dias);
  if (flete === null || [flete, minimo, dias].some(Number.isNaN)) return { error: "Precio, mínimo o días no son números" };
  const tramos = rangosPeso(r.rangos);
  if (tramos === null) return { error: "Rangos de peso: usa el formato 45:4.5; 100:3.9" };
  const form: TarifaMultimodoForm = {
    modo: m, agente_id: agente?.id ?? "", moneda,
    ...leerRuta(r, m),
    flete_base: flete, minimo, transit_time_dias: dias,
    vigente_desde: fechaIso(r.desde) ?? "", vigente_hasta: fechaIso(r.hasta) ?? "", tramos: [],
  };
  form.tramos = usaTramos(form) ? tramos : [];
  if (m === "Terrestre" && !["FTL", "LTL", "Arrastre"].includes(form.submodalidad)) return { error: "Submodalidad debe ser FTL, LTL o Arrastre" };
  const faltan = faltantesTarifaMultimodo(form);
  if (faltan.length) return { error: `Falta o es inválido: ${faltan.join(", ")}` };
  return { form };
}

export function prepararMultimodo(filas: Record<string, unknown>[], agentes: Agentes): ResultadoMultimodo {
  if (filas.length > MAX_FILAS_MULTIMODO) return { tarifas: [], errores: [`El archivo tiene ${filas.length} renglones; el máximo es ${MAX_FILAS_MULTIMODO}.`] };
  const tarifas: FilaMultimodo[] = []; const errores: string[] = [];
  filas.forEach((cruda, i) => {
    const fila = i + 2;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cruda)) { const c = campo(k); if (c && r[c] === undefined) r[c] = v; }
    if (Object.values(r).every((v) => txt(v) === "")) return;
    const res = convertir(r, agentes);
    if (res.form) tarifas.push({ fila, form: res.form }); else errores.push(`Fila ${fila}: ${res.error}`);
  });
  return { tarifas, errores };
}
