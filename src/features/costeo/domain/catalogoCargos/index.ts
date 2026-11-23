/** Consulta del catálogo único de cargos (código interno GRUPO-CONCEPTO). */
import { FILAS_CARGO, GRUPOS_CARGO } from "./datos";

export type ModoCargo = "Marítimo" | "Aéreo" | "Terrestre";

export interface CargoCatalogo {
  codigo: string; concepto: string; grupo: string; modos: ModoCargo[];
  etapa: string; base: string; alias: string; porEmbarque: boolean;
}

const LETRA: Record<string, ModoCargo> = { M: "Marítimo", A: "Aéreo", T: "Terrestre" };

export const CATALOGO_CARGOS: readonly CargoCatalogo[] = FILAS_CARGO.map(
  ([codigo, concepto, modos, etapa, base, alias, porEmbarque]) => ({
    codigo, concepto, grupo: codigo.slice(0, 3), modos: [...modos].map((l) => LETRA[l]),
    etapa, base, alias, porEmbarque,
  }),
);

/** Fletes base: se capturan en la tarifa, no como recargo. */
const FLETES_BASE = new Set(["FRT-OF", "FRT-AF", "FRT-LH", "FRT-RL"]);

/** Texto que se guarda en el recargo: código + concepto. */
export const etiquetaCargo = (c: CargoCatalogo) => `${c.codigo} · ${c.concepto}`;

/** Código interno de un texto guardado ("SUR-BAF · …"); null en textos previos al catálogo. */
export function codigoDeConcepto(texto: string | null | undefined): string | null {
  const m = /^([A-Z]{3}-[A-Z]{2,4})(?: ·|$)/.exec(texto ?? "");
  return m && CATALOGO_CARGOS.some((c) => c.codigo === m[1]) ? m[1] : null;
}

export function cargoPorCodigo(codigo: string | null): CargoCatalogo | undefined {
  return codigo ? CATALOGO_CARGOS.find((c) => c.codigo === codigo) : undefined;
}

/** Recargos del modo agrupados por grupo del catálogo, en el orden del catálogo. */
export function recargosPorGrupo(modo: ModoCargo): { grupo: string; nombre: string; cargos: CargoCatalogo[] }[] {
  const grupos = new Map<string, CargoCatalogo[]>();
  for (const c of CATALOGO_CARGOS) {
    if (FLETES_BASE.has(c.codigo) || !c.modos.includes(modo)) continue;
    grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  }
  return [...grupos].map(([grupo, cargos]) => ({ grupo, nombre: GRUPOS_CARGO[grupo] ?? grupo, cargos }));
}
