/** Medidas de carga aérea: bultos × largo × ancho × alto (cm) → m³ y peso tasable. */
import { pesoTasable } from "@/features/costeo/domain/tarifaPorPeso";

export interface MedidasBultos { bultos: number | null; largo: number | null; ancho: number | null; alto: number | null }

/** Volumen total en m³ (3 decimales) o null si falta alguna medida. */
export function volumenBultosM3(m: MedidasBultos): number | null {
  const v = [m.bultos, m.largo, m.ancho, m.alto];
  if (v.some((x) => x == null || !(x > 0))) return null;
  return Math.round(((m.bultos! * m.largo! * m.ancho! * m.alto!) / 1_000_000) * 1000) / 1000;
}

/** Texto que se guarda en "Dimensiones". */
export function textoDimensiones(m: MedidasBultos): string | null {
  if (volumenBultosM3(m) == null) return null;
  return `${m.bultos} bulto(s) de ${m.largo}×${m.ancho}×${m.alto} cm`;
}

/** Lee "N bulto(s) de L×A×H cm" de vuelta a medidas. */
export function leerDimensiones(t: string | null | undefined): MedidasBultos {
  const r = /^(\d+) bulto\(s\) de ([\d.]+)×([\d.]+)×([\d.]+) cm$/.exec(t ?? "");
  return r ? { bultos: +r[1], largo: +r[2], ancho: +r[3], alto: +r[4] } : { bultos: null, largo: null, ancho: null, alto: null };
}

/** Peso real a kg según la unidad capturada. */
export function pesoEnKg(peso: string | null | undefined, unidad: string | null | undefined): number | null {
  const n = Number(String(peso ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return unidad === "kg" ? n : unidad === "t" ? n * 1000 : unidad === "lb" ? n * 0.45359237 : null;
}

/** Peso tasable aéreo (kg) o null si falta peso real o volumen. */
export function pesoTasableSolicitud(peso: string | null | undefined, unidad: string | null | undefined, cbm: number | null | undefined): number | null {
  const kg = pesoEnKg(peso, unidad);
  return kg == null || cbm == null ? null : pesoTasable(kg, cbm);
}

/** Varias líneas de bultos (carga mixta), guardadas en "Dimensiones" separadas por "; ". */
export function volumenLineasM3(ls: MedidasBultos[]): number | null {
  const vs = ls.map(volumenBultosM3);
  if (ls.length === 0 || vs.some((v) => v == null)) return null;
  return Math.round(vs.reduce<number>((a, v) => a + (v ?? 0), 0) * 1000) / 1000;
}

export function textoDimensionesLineas(ls: MedidasBultos[]): string | null {
  return volumenLineasM3(ls) == null ? null : ls.map((l) => textoDimensiones(l)).join("; ");
}

export function totalBultos(ls: MedidasBultos[]): number | null {
  return ls.every((l) => l.bultos != null) ? ls.reduce((a, l) => a + (l.bultos ?? 0), 0) : null;
}

/** Lee una o varias líneas; si no reconoce el texto devuelve una línea vacía. */
export function leerDimensionesLineas(t: string | null | undefined): MedidasBultos[] {
  const partes = (t ?? "").split("; ").map(leerDimensiones);
  return partes.every((p) => p.bultos != null) ? partes : [leerDimensiones(null)];
}
