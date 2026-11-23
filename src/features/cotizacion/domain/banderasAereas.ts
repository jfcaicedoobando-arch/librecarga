/**
 * Banderas críticas aéreas que vienen de la solicitud de Pricing
 * (baterías de litio, Known Shipper, PAX/CAO). La cotización guarda una copia para el PDF del cliente.
 */
export interface BanderasAereas {
  baterias_litio: boolean | null;
  known_shipper: boolean | null;
  tipo_aeronave: string | null;
}

const SI_NO = (v: boolean) => (v ? "Sí" : "No");
const AERONAVE: Record<string, string> = { PAX: "PAX (avión de pasajeros)", CAO: "CAO (sólo carguero)" };

/** Pares etiqueta/valor listos para mostrar; omite las respuestas vacías. */
export function itemsBanderasAereas(b: BanderasAereas | null | undefined): Array<[string, string]> {
  if (!b) return [];
  const items: Array<[string, string]> = [];
  if (b.baterias_litio != null) items.push(["Baterías de litio", SI_NO(b.baterias_litio)]);
  if (b.known_shipper != null) items.push(["Expedidor conocido (Known Shipper)", SI_NO(b.known_shipper)]);
  if (b.tipo_aeronave) items.push(["Tipo de avión", AERONAVE[b.tipo_aeronave] ?? b.tipo_aeronave]);
  return items;
}

/** Columnas de `cotizaciones`: sólo se guardan en aéreo. */
export function columnasBanderasAereas(esAereo: boolean, b: BanderasAereas | null | undefined): BanderasAereas {
  return esAereo && b ? { baterias_litio: b.baterias_litio, known_shipper: b.known_shipper, tipo_aeronave: b.tipo_aeronave }
    : { baterias_litio: null, known_shipper: null, tipo_aeronave: null };
}
