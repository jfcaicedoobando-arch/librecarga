import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

export const notaId = "nc-qa";
export const org = "librecarga-qa";
export const claim = "PENDING:8A310351-4E2C-4249-B0A4-4A6A50607512";
export const uuid = "9DB0A395-76FD-42AE-8DB9-67F9EACD68F2";
export const facturaUuid = "9DB0A395-76FD-42AE-8DB9-67F9EACD68F1";
export const esperado = {
  tipo: "E" as const, nota_id: notaId, organization_id: org, factura_uuid: facturaUuid, ambiente: "sandbox" as const,
  emisor: { rfc: "GODE561231GR8", regimen_fiscal: "626", codigo_postal: "01000", facturapi_org_id: "fapi-org-qa" },
  receptor: { rfc: "EKU9003173C9", regimen_fiscal: "601", codigo_postal: "01010" },
  datos_factura: { tipo_cambio: 1, uso_cfdi: "G02", metodo_pago: "PUE", forma_pago: "15", serie: "NC" },
  tasas_iva_retenido: [.04],
  totales: { moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 8.03, total: 222.39 },
};
export const remoto = {
  id: "nc-remota-qa", type: "E", uuid, external_id: claim, livemode: false,
  status: "valid", currency: "MXN", total: 222.39, folio_number: 80, series: "NC",
};
export const xml = `<cfdi:Comprobante Version="4.0" TipoDeComprobante="E" Moneda="MXN" SubTotal="200.80" Total="222.39"
  FormaPago="15" MetodoPago="PUE" LugarExpedicion="01000" Serie="NC" Folio="80">
  <cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="${facturaUuid}"/></cfdi:CfdiRelacionados>
  <cfdi:Emisor Rfc="${esperado.emisor.rfc}" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="${esperado.receptor.rfc}" RegimenFiscalReceptor="601" UsoCFDI="G02" DomicilioFiscalReceptor="01010"/>
  <cfdi:Conceptos><cfdi:Concepto Cantidad="2" Importe="200.80" ValorUnitario="100.40">
    <cfdi:Impuestos><cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" TasaOCuota="0.012500" Importe="2.510000"/>
      <cfdi:Retencion Impuesto="002" TasaOCuota="0.040000" Importe="8.032000"/>
    </cfdi:Retenciones></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="32.13" TotalImpuestosRetenidos="10.54">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" Importe="2.51"/><cfdi:Retencion Impuesto="002" Importe="8.03"/>
    </cfdi:Retenciones>
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="32.13"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento></cfdi:Comprobante>`;

export function dbNotaFiscal(facturapiId: string | null = null) {
  const llamadas: string[] = [];
  const resultados: Record<string, unknown>[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push(fn);
      if (fn === "reservar_nota_credito_isr") return Promise.resolve({ data: { claim, esperado }, error: null });
      if (fn === "obtener_intento_nota_credito_isr") {
        return Promise.resolve({ data: { protegido: true, esperado, facturapi_id: facturapiId }, error: null });
      }
      resultados.push(args);
      return Promise.resolve({ data: { estado: args.p_estado }, error: null });
    },
    storage: { from: () => ({ upload: (path: string) => { llamadas.push(path); return Promise.resolve({ error: null }); } }) },
  } as unknown as SupabaseClient;
  return { admin, llamadas, resultados };
}
