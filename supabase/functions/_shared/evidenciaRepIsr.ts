import { conciliarRepIsr, type PrevalidacionRepIsr } from "./conciliarRepIsr.ts";
import { type EvidenciaTimbradoIsr, obtenerEvidenciaTimbradoIsr } from "./evidenciaTimbradoIsr.ts";

type DatosRep = Pick<EvidenciaTimbradoIsr, "admin" | "organizationId" | "claim" | "remoto" | "apiKey"> & {
  esperado: PrevalidacionRepIsr;
};

export function obtenerEvidenciaRepIsr(input: DatosRep, request: typeof fetch = fetch) {
  const { esperado, claim, remoto } = input;
  return obtenerEvidenciaTimbradoIsr({
    ...input, carpeta: "rep", tipo: "P", ambiente: esperado.perfil.ambiente,
    facturapiOrgId: esperado.perfil.emisor.facturapiOrgId,
    conciliar: (xml) => conciliarRepIsr(esperado, claim, remoto, xml),
  }, request);
}
