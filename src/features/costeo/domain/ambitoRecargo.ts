/** Tipo de recargo: local (MXN, puede llevar IVA) o internacional (USD, puede llevar VAT). */
export type AmbitoRecargo = "local" | "internacional";

/** Moneda fija de cada tipo de recargo. */
export function monedaDeAmbito(ambito: AmbitoRecargo | null | undefined): "MXN" | "USD" {
  return ambito === "local" ? "MXN" : "USD";
}

/** Tipo guardado o, si no hay, el que corresponde a su moneda (o la de la tarifa). */
export function ambitoDeRecargo(
  r: { ambito?: AmbitoRecargo | null; moneda?: string | null },
  monedaTarifa = "USD",
): AmbitoRecargo {
  if (r.ambito === "local" || r.ambito === "internacional") return r.ambito;
  return (r.moneda ?? monedaTarifa).toUpperCase() === "MXN" ? "local" : "internacional";
}

/** Etiqueta del impuesto que aplica a cada tipo. */
export function etiquetaImpuesto(ambito: AmbitoRecargo | null | undefined): string {
  return ambito === "local" ? "+ IVA" : "+ VAT";
}
