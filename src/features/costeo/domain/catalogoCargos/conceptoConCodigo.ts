/** Texto visible para el cliente: antepone el código del catálogo cuando se reconoce. */
import { CATALOGO_CARGOS, codigoDeConcepto } from "./index";

const FLETES: [RegExp, string][] = [
  [/^flete mar[ií]timo/i, "FRT-OF"], [/^flete a[ée]reo/i, "FRT-AF"], [/^flete terrestre/i, "FRT-LH"],
];

const norm = (s: string) => s.trim().toUpperCase();

/** Código de un texto previo al catálogo (concepto o alias exacto; sin el sufijo «(Origen)»). */
function codigoPrevio(texto: string): string | null {
  const flete = FLETES.find(([re]) => re.test(texto));
  if (flete) return flete[1];
  const base = norm(texto.replace(/\s*\([^)]*\)\s*$/, ""));
  if (!base) return null;
  const hit = CATALOGO_CARGOS.find((c) => norm(c.concepto) === base
    || c.alias.split(",").some((a) => norm(a) === base));
  return hit?.codigo ?? null;
}

/** «SUR-BAF · …» queda igual; «BAF (Origen)» → «SUR-BAF · BAF (Origen)»; sin coincidencia, igual. */
export function conceptoConCodigo(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  if (!t || codigoDeConcepto(t)) return t;
  const codigo = codigoPrevio(t);
  return codigo ? `${codigo} · ${t}` : t;
}
