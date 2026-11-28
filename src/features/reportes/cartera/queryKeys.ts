import type { CarteraDataScope } from "./services/carteraSnapshot";

const historica = (scope: CarteraDataScope) =>
  ["reportes", "corteCxc", scope.organizationId, scope.role, scope.userId, scope.generation] as const;

export const carteraKeys = {
  historica,
  corte: (scope: CarteraDataScope, fecha: string) => [...historica(scope), fecha] as const,
  apertura: (scope: CarteraDataScope) => [...historica(scope), "apertura"] as const,
  preview: (scope: CarteraDataScope, fecha: string) => [...historica(scope), "preview", fecha] as const,
  snapshot: (scope: CarteraDataScope, diaNegocio: string) =>
    ["reportes", "cartera", scope.userId, scope.organizationId, scope.role, scope.generation, diaNegocio] as const,
} as const;
