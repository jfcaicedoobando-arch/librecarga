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
