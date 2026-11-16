import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conciliarCfdiIsr, type DocumentoFacturapiIsr, type PrevalidacionTimbradoIsr } from "./conciliarCfdiIsr.ts";

const claim = "PENDING:qa";
const uuid = "2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88";
const esperado: PrevalidacionTimbradoIsr = {
  ambiente: "sandbox",
  emisor: { facturapi_org_id: "org-pac-qa", rfc: "GODE561231GR8", regimen_fiscal: "626" },
  receptor: { rfc: "EKU9003173C9", regimen_fiscal: "601" },
  datos_factura: { tipo_cambio: 1 },
  totales: { moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 8.03, total: 222.39 },
};
const remoto: DocumentoFacturapiIsr = {
  id: "factura-qa", uuid, external_id: claim, livemode: false, type: "I", status: "valid",
  folio_number: 77, series: "QA", currency: "MXN", total: 222.39,
};
const xml = `<cfdi:Comprobante Version="4.0" TipoDeComprobante="I" Moneda="MXN" SubTotal="200.80" Total="222.39">
  <cfdi:Emisor Rfc="GODE561231GR8" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="EKU9003173C9" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Cantidad="2" ValorUnitario="100.40" Importe="200.80">
      <cfdi:Impuestos>
        <cfdi:Retenciones><cfdi:Retencion Impuesto="001" TasaOCuota="0.012500" Importe="2.510000"/></cfdi:Retenciones>
        <cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="32.128000"/></cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="32.13" TotalImpuestosRetenidos="10.54">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" Importe="2.51"/>
      <cfdi:Retencion Impuesto="002" Importe="8.03"/>
    </cfdi:Retenciones>
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" TipoFactor="Tasa" Importe="32.13"/></cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento>
</cfdi:Comprobante>`;

Deno.test("conciliación ISR toma los impuestos de cabecera y separa ambas retenciones", () => {
  assertEquals(conciliarCfdiIsr(esperado, claim, remoto, xml), {
    uuid, emisor_rfc: "GODE561231GR8", emisor_regimen: "626", receptor_rfc: "EKU9003173C9",
    receptor_regimen: "601", uso_cfdi: "G03", totales: esperado.totales,
  });
});

Deno.test("conciliación ISR detecta retenciones intercambiadas aunque el total neto coincida", () => {
  assertThrows(() => conciliarCfdiIsr(esperado, claim, remoto,
    xml.replace('Impuesto="001" Importe="2.51"', 'Impuesto="002" Importe="2.51"')
      .replace('Impuesto="002" Importe="8.03"', 'Impuesto="001" Importe="8.03"')),
    Error, "impuestos_xml_no_coinciden");
  assertThrows(() => conciliarCfdiIsr(esperado, claim, remoto, xml.replace("0.012500", "0.010000")),
    Error, "tasa_isr_xml_no_coincide");
});

Deno.test("conciliación ISR rechaza intento, ambiente, total o RFC discordantes", () => {
  for (const datos of [{ external_id: "PENDING:otro" }, { livemode: true }, { total: 222.37 }, { status: "pending" }]) {
    assertThrows(() => conciliarCfdiIsr(esperado, claim, { ...remoto, ...datos }, xml), Error,
      "respuesta_facturapi_no_coincide");
  }
  assertThrows(() => conciliarCfdiIsr(esperado, claim, remoto, xml.replace("EKU9003173C9", "AAA010101AA0")), Error,
    "identidad_o_cabecera_xml_no_coincide");
});

Deno.test("conciliación ISR confirma moneda nativa y tipo de cambio de un CFDI USD", () => {
  const usd = { ...esperado, datos_factura: { tipo_cambio: 19.9 }, totales: { ...esperado.totales, moneda: "USD" } };
  const factura = { ...remoto, currency: "USD" };
  const documento = xml.replace('Moneda="MXN"', 'Moneda="USD" TipoCambio="19.900000"');
  assertEquals(conciliarCfdiIsr(usd, claim, factura, documento).totales, usd.totales);
  assertThrows(() => conciliarCfdiIsr(usd, claim, factura, documento.replace("19.900000", "19.8")), Error,
    "identidad_o_cabecera_xml_no_coincide");
});

Deno.test("la sustituta concilia sólo con el UUID original y relación 04", () => {
  const origen = "F62BE5B4-F227-431F-9E24-1BC47FB6ADE8";
  const sustitucion = { ...esperado, sustituye_uuid: origen };
  const relacionado = `<cfdi:CfdiRelacionado UUID="${origen}"/>`;
  const documento = xml.replace("<cfdi:Emisor", `<cfdi:CfdiRelacionados TipoRelacion="04">${relacionado}</cfdi:CfdiRelacionados><cfdi:Emisor`);
  assertEquals(conciliarCfdiIsr(sustitucion, claim, remoto, documento).sustituye_uuid, origen);
  for (const incierto of [xml, documento.replace(origen, uuid), documento.replace('TipoRelacion="04"', 'TipoRelacion="01"'),
    documento.replace(relacionado, relacionado.repeat(2))]) {
    assertThrows(() => conciliarCfdiIsr(sustitucion, claim, remoto, incierto), Error, "cfdi_sustitucion_relacion_no_coincide");
  }
});
