export const perfilFiscalEmisorKeys = {
  all: ["perfil_fiscal_emisor"] as const,
  detalle: (orgId: string, ambiente: string, userId: string) => ["perfil_fiscal_emisor", orgId, ambiente, userId] as const,
};
export const facturapiCredencialesKeys = {
  byOrg: (orgId: string) => ["facturapi_credenciales", orgId] as const,
};
