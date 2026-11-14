export const broker = {
  all: ["broker"] as const,
  empresas: ["broker", "mis-empresas"] as const,
  organizaciones: ["broker", "orgs"] as const,
  buscar: (brokerId: string | null, texto: string) => ["broker", "buscar", brokerId, texto] as const,
  solicitudes: ["broker", "solicitudes"] as const,
  comisiones: ["broker", "comisiones"] as const,
} as const;
