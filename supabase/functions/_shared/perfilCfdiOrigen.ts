import type { FacturapiAmbiente } from "./facturapiAuth.ts";
import { consultarPerfilProveedor } from "./facturapiPerfilProveedor.ts";

interface DatosFacturaOrigen {
  organization_id?: string | null;
  cliente_id: string;
  evaluacion_fiscal?: unknown;
  snapshot_emision?: unknown;
  ambiente?: string | null;
}

export interface PerfilCfdiOrigen {
  ambiente: FacturapiAmbiente;
  emisor: { facturapiOrgId: string; rfc: string; regimen: string; cp: string };
  receptor: { id: string; nombre: string; rfc: string; regimen_fiscal: string; codigo_postal: string };
}

export const MENSAJE_PERFIL_CFDI_ORIGEN =
  "Revisa el emisor, el receptor y la credencial del ambiente en que se timbró la factura original.";

function objeto(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads the frozen fiscal identity of a certified invoice. */
export function perfilCfdiOrigen(factura: DatosFacturaOrigen, organizationId: string): PerfilCfdiOrigen | null | "incompleto" {
  if (factura.evaluacion_fiscal == null) return null;
  const snapshot = objeto(factura.snapshot_emision);
  const emisor = objeto(snapshot.organizacion_snapshot);
  const receptor = objeto(snapshot.cliente_snapshot);
  const ambiente = factura.ambiente;
  if ((ambiente !== "sandbox" && ambiente !== "live") || factura.organization_id !== organizationId
    || snapshot.evaluacion_fiscal == null || emisor.id !== organizationId || receptor.id !== factura.cliente_id) {
    return "incompleto";
  }
  const emisorFiscal = { facturapiOrgId: texto(emisor.facturapi_org_id), rfc: texto(emisor.rfc),
    regimen: texto(emisor.regimen_fiscal), cp: texto(emisor.codigo_postal) };
  const receptorFiscal = { id: factura.cliente_id, nombre: texto(receptor.nombre), rfc: texto(receptor.rfc),
    regimen_fiscal: texto(receptor.regimen_fiscal), codigo_postal: texto(receptor.codigo_postal) };
  if (!Object.values(emisorFiscal).every(Boolean) || !Object.values(receptorFiscal).every(Boolean)) return "incompleto";
  return { ambiente, emisor: emisorFiscal, receptor: receptorFiscal };
}

export async function verificarLlaveCfdiOrigen(
  origen: PerfilCfdiOrigen,
  key: { apiKey: string; ambiente: string; facturapiOrgId: string | null },
  consultar = consultarPerfilProveedor,
): Promise<boolean> {
  const { emisor } = origen;
  if (key.ambiente !== origen.ambiente || key.facturapiOrgId !== emisor.facturapiOrgId) return false;
  try {
    const observado = await consultar(key.apiKey);
    return observado.facturapi_org_id === emisor.facturapiOrgId && observado.rfc === emisor.rfc
      && observado.regimen_fiscal === emisor.regimen && observado.codigo_postal === emisor.cp;
  } catch {
    return false;
  }
}
