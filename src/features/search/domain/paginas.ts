/**
 * Destinos navegables locales del buscador global ("Páginas"). No dependen
 * del RPC de búsqueda de entidades (que no puede modificarse): son rutas
 * fijas del ERP, filtradas por acceso de rol y coincidencia de texto.
 */
import { hasRouteAccess } from "@/lib/access/roleRouteMatrix";
import { normalizarBusqueda } from "@/lib/text/normalizarBusqueda";
import type { AppRole } from "@/types/appRole";
import type { GlobalSearchResult } from "@/types/search";

interface PaginaDestino {
  id: string;
  label: string;
  sublabel?: string;
  url: string;
}

/** Catálogo de páginas navegables por búsqueda global. */
const PAGINAS: readonly PaginaDestino[] = [
  { id: "pagina-costeo-tarifas", label: "Tarifas de agentes", sublabel: "Costeo", url: "/costeo/tarifas" },
  { id: "pagina-costeo-agentes", label: "Agentes", sublabel: "Costeo", url: "/costeo/agentes" },
  { id: "pagina-costeo-navieras", label: "Navieras", sublabel: "Costeo", url: "/costeo/navieras" },
];

/**
 * Páginas accesibles para `role` cuyo texto coincide con `query`. Con
 * `query` vacío no regresa nada (el buscador ya muestra "Recientes").
 */
export function buscarPaginas(
  query: string,
  role: AppRole | null | undefined,
): GlobalSearchResult[] {
  const termino = normalizarBusqueda(query);
  if (!termino) return [];

  return PAGINAS.filter((pagina) => hasRouteAccess(role, pagina.url))
    .filter((pagina) => {
      const texto = normalizarBusqueda(`${pagina.label} ${pagina.sublabel ?? ""}`);
      return texto.includes(termino);
    })
    .map((pagina) => ({
      id: pagina.id,
      label: pagina.label,
      sublabel: pagina.sublabel,
      type: "pagina" as const,
      url: pagina.url,
    }));
}
