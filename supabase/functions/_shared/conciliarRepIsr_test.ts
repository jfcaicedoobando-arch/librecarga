import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { conciliarRepIsr, type PrevalidacionRepIsr } from "./conciliarRepIsr.ts";
import { obtenerEvidenciaRepIsr } from "./evidenciaRepIsr.ts";
import { basicAuthHeader, FACTURAPI_BASE } from "./facturapiAuth.ts";

const claim = "PENDING:rep-qa";
const uuid = "F62BE5B4-F227-431F-9E24-1BC47FB6ADE8";
const factura = "2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88";
const remoto = {
  id: "rep-qa", uuid, external_id: claim, livemode: false, type: "P", status: "valid", total: 0,
  organization: "facturapi-qa", folio_number: 17, series: "P",
};
const esperado: PrevalidacionRepIsr = {
  perfil: {
    ambiente: "sandbox",
    emisor: { facturapiOrgId: "facturapi-qa", rfc: "GODE561231GR8", regimen: "626", cp: "06000" },
    receptor: { id: "cliente-qa", nombre: "EMPRESA DE PRUEBA", rfc: "EKU9003173C9", regimen_fiscal: "601", codigo_postal: "06400" },
  },
  pago: { fecha: "2026-11-15", moneda: "MXN", monto: 50, forma: "03", tipo_cambio: 1 },
  documento: {
    uuid: factura, moneda: "MXN", equivalencia: 1, parcialidad: 1, saldo_anterior: 166.8,
    importe_pagado: 50, saldo_insoluto: 116.8, objeto_impuesto: "02",
    impuestos: [
      { type: "ISR", withholding: true, factor: "Tasa", rate: 0.0125, base: 45.15 },
      { type: "IVA", withholding: true, factor: "Tasa", rate: 0.04, base: 45.15 },
      { type: "IVA", withholding: false, factor: "Tasa", rate: 0.16, base: 45.15 },
    ],
  },
};
const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="P" Moneda="XXX"
  SubTotal="0" Total="0" LugarExpedicion="06000" Folio="17" Serie="P">
  <cfdi:Emisor Rfc="GODE561231GR8" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="EKU9003173C9" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="06400" UsoCFDI="CP01"/>
  <cfdi:Conceptos><cfdi:Concepto Cantidad="1" Importe="0" ValorUnitario="0"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <pagos:Pagos xmlns:pagos="http://www.sat.gob.mx/Pagos20" Version="2.0">
      <pagos:Totales MontoTotalPagos="50.00" TotalRetencionesISR="0.56" TotalRetencionesIVA="1.81"
         TotalTrasladosBaseIVA16="45.15" TotalTrasladosImpuestoIVA16="7.22"/>
      <pagos:Pago FechaPago="2026-11-15T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="50.00">
        <pagos:DoctoRelacionado IdDocumento="${factura}" MonedaDR="MXN" ObjetoImpDR="02"
          EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="166.80" ImpPagado="50.00" ImpSaldoInsoluto="116.80">
          <pagos:ImpuestosDR>
            <pagos:RetencionesDR>
              <pagos:RetencionDR ImpuestoDR="001" TipoFactorDR="Tasa" TasaOCuotaDR="0.012500" BaseDR="45.15" ImporteDR="0.564375"/>
              <pagos:RetencionDR ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.040000" BaseDR="45.15" ImporteDR="1.806000"/>
            </pagos:RetencionesDR>
            <pagos:TrasladosDR><pagos:TrasladoDR ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000"
              BaseDR="45.15" ImporteDR="7.224000"/></pagos:TrasladosDR>
          </pagos:ImpuestosDR>
        </pagos:DoctoRelacionado>
        <pagos:ImpuestosP>
          <pagos:RetencionesP><pagos:RetencionP ImpuestoP="001" ImporteP="0.564375"/>
            <pagos:RetencionP ImpuestoP="002" ImporteP="1.806000"/></pagos:RetencionesP>
          <pagos:TrasladosP><pagos:TrasladoP ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000"
            BaseP="45.15" ImporteP="7.224000"/></pagos:TrasladosP>
        </pagos:ImpuestosP>
      </pagos:Pago>
    </pagos:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${uuid}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

Deno.test("REP después de nota de crédito devuelve el IVA retenido certificado de 1.81 MXN", () => {
  assertEquals(conciliarRepIsr(esperado, claim, remoto, xml), {
    uuid, factura_uuid: factura, emisor_rfc: "GODE561231GR8", receptor_rfc: "EKU9003173C9", moneda_pago: "MXN",
    monto_recibido: 50, moneda_factura: "MXN", parcialidad: 1, saldo_anterior: 166.8, importe_pagado: 50,
    saldo_insoluto: 116.8, ret_isr: 0.56, ret_iva: 1.81,
  });
});

Deno.test("REP distingue retenciones en MXN del pago en USD y verifica sus equivalencias", () => {
  const usd: PrevalidacionRepIsr = {
    ...esperado,
    pago: { ...esperado.pago, moneda: "USD", monto: 2, tipo_cambio: 20 },
    documento: {
      ...esperado.documento, equivalencia: 20, parcialidad: 2, saldo_anterior: 94.65, importe_pagado: 40, saldo_insoluto: 54.65,
      impuestos: esperado.documento.impuestos.map((impuesto) => ({ ...impuesto, base: 36.12 })),
    },
  };
  const documento = xml.replace('MontoTotalPagos="50.00"', 'MontoTotalPagos="40.00"')
    .replace('TotalRetencionesISR="0.56"', 'TotalRetencionesISR="0.45"')
    .replace('TotalRetencionesIVA="1.81"', 'TotalRetencionesIVA="1.44"')
    .replace('TotalTrasladosBaseIVA16="45.15"', 'TotalTrasladosBaseIVA16="36.12"')
    .replace('TotalTrasladosImpuestoIVA16="7.22"', 'TotalTrasladosImpuestoIVA16="5.78"')
    .replace('MonedaP="MXN" Monto="50.00"', 'MonedaP="USD" Monto="2.00" TipoCambioP="20.000000"')
    .replace('EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="166.80" ImpPagado="50.00" ImpSaldoInsoluto="116.80"',
      'EquivalenciaDR="20" NumParcialidad="2" ImpSaldoAnt="94.65" ImpPagado="40.00" ImpSaldoInsoluto="54.65"')
    .replaceAll('BaseDR="45.15"', 'BaseDR="36.12"')
    .replace('ImporteDR="0.564375"', 'ImporteDR="0.451500"').replace('ImporteP="0.564375"', 'ImporteP="0.022575"')
    .replace('ImporteDR="1.806000"', 'ImporteDR="1.444800"').replace('ImporteP="1.806000"', 'ImporteP="0.072240"')
    .replace('ImporteDR="7.224000"', 'ImporteDR="5.779200"').replace('ImporteP="7.224000"', 'ImporteP="0.288960"')
    .replace('BaseP="45.15"', 'BaseP="1.806000"');
  const evidencia = conciliarRepIsr(usd, claim, remoto, documento);
  assertEquals([evidencia.monto_recibido, evidencia.importe_pagado, evidencia.ret_isr, evidencia.ret_iva], [2, 40, 0.45, 1.44]);
  assertThrows(() => conciliarRepIsr(usd, claim, remoto, documento.replace('EquivalenciaDR="20"', 'EquivalenciaDR="0.05"')),
    Error, "documento_relacionado_rep_no_coincide");
});

Deno.test("REP rechaza intentos, ambientes, organizaciones y receptores ajenos", () => {
  for (const cambio of [{ external_id: "PENDING:otro" }, { livemode: true }, { organization: "otro" }, { status: "pending" }]) {
    assertThrows(() => conciliarRepIsr(esperado, claim, { ...remoto, ...cambio }, xml), Error, "respuesta_facturapi_rep_no_coincide");
  }
  assertThrows(() => conciliarRepIsr(esperado, claim, remoto, xml.replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="626"')),
    Error, "identidad_o_cabecera_rep_no_coincide");
  assertThrows(() => conciliarRepIsr(esperado, claim, remoto, xml.replace(factura, uuid)), Error, "documento_relacionado_rep_no_coincide");
  assertThrows(() => conciliarRepIsr(esperado, claim, remoto, xml.replace('ImpSaldoInsoluto="116.80"', 'ImpSaldoInsoluto="116.79"')),
    Error, "documento_relacionado_rep_no_coincide");
});

Deno.test("REP rechaza diferencias en grupos DR, agregados P y totales MXN", () => {
  const casos = [
    ['TasaOCuotaDR="0.040000"', 'TasaOCuotaDR="0.050000"', "base_o_tasa_impuesto_rep_no_coincide"],
    ['BaseDR="45.15"', 'BaseDR="45.14"', "base_o_tasa_impuesto_rep_no_coincide"],
    ['ImporteDR="1.806000"', 'ImporteDR="1.800000"', "importe_impuesto_rep_no_coincide"],
    ['ImporteP="1.806000"', 'ImporteP="1.800000"', "impuestos_moneda_pago_no_coinciden"],
    ['TotalRetencionesIVA="1.81"', 'TotalRetencionesIVA="1.80"', "totales_mxn_rep_no_coinciden"],
  ];
  for (const [antes, despues, error] of casos) {
    assertThrows(() => conciliarRepIsr(esperado, claim, remoto, xml.replace(antes, despues)), Error, error);
  }
  assertThrows(() => conciliarRepIsr(esperado, claim, remoto, xml.replace("<pagos:Pago ", "<pagos:Pago/><pagos:Pago ")),
    Error, "nodo_cfdi_invalido_Pago");
});

Deno.test("REP distingue el traslado exento de una tasa de IVA de 0%", () => {
  const exento: PrevalidacionRepIsr = { ...esperado, documento: { ...esperado.documento, impuestos:
    esperado.documento.impuestos.map((t) => t.withholding ? t : { ...t, factor: "Exento", rate: 0 }) } };
  const documento = xml.replace('TotalTrasladosBaseIVA16="45.15" TotalTrasladosImpuestoIVA16="7.22"', 'TotalTrasladosBaseIVAExento="45.15"')
    .replace('TipoFactorDR="Tasa" TasaOCuotaDR="0.160000"', 'TipoFactorDR="Exento"').replace(' ImporteDR="7.224000"', '')
    .replace('TipoFactorP="Tasa" TasaOCuotaP="0.160000"', 'TipoFactorP="Exento"').replace(' ImporteP="7.224000"', '');
  assertEquals(conciliarRepIsr(exento, claim, remoto, documento).ret_iva, 1.81);
  assertThrows(() => conciliarRepIsr(exento, claim, remoto, documento.replace('BaseP="45.15"', 'BaseP="45.15" ImporteP="0"')),
    Error, "tratamiento_exento_rep_invalido");
});

Deno.test("evidencia REP respalda sólo el XML que corresponde al intento y no pierde su referencia", async () => {
  const llamados: string[] = [];
  const apiKey = "sk_test_organizacion_qa";
  const ruta = `organizacion-qa/rep/${uuid}.xml`;
  const admin = { storage: { from: (bucket: string) => ({
    upload: (path: string, bytes: Uint8Array) => {
      llamados.push(`${bucket}/${path}`);
      assertEquals(new TextDecoder().decode(bytes), xml);
      return Promise.resolve({ error: null });
    },
  }) } } as unknown as SupabaseClient;
  const base = { admin, organizationId: "organizacion-qa", claim, remoto, apiKey, esperado };
  const request = ((url, args) => {
    assertEquals(url, `${FACTURAPI_BASE}/invoices/rep-qa/xml`);
    assertEquals(new Headers(args?.headers).get("Authorization"), basicAuthHeader(apiKey));
    assertEquals(args?.redirect, "error");
    llamados.push("xml_pac");
    return Promise.resolve(new Response(xml));
  }) satisfies typeof fetch;

  const ajeno = await obtenerEvidenciaRepIsr({ ...base, remoto: { ...remoto, livemode: true } }, request);
  assertEquals(ajeno, { estado: "conciliacion", datos: { motivo: "respuesta_ajena_al_intento" } });
  assertEquals(llamados, []);

  const descuadre = await obtenerEvidenciaRepIsr(base, () =>
    Promise.resolve(new Response(xml.replace('TotalRetencionesIVA="1.81"', 'TotalRetencionesIVA="1.80"'))));
  assertEquals([descuadre.estado, descuadre.datos.motivo, descuadre.datos.facturapi_id], ["conciliacion", "descuadre_cfdi", remoto.id]);
  assertEquals(llamados, []);

  const resultado = await obtenerEvidenciaRepIsr(base, request);
  const evidencia = resultado.datos.xml as { ruta: string; sha256: string; ret_iva: number };
  assertEquals([resultado.estado, evidencia.ruta, evidencia.sha256.length, evidencia.ret_iva], ["confirmado", ruta, 64, 1.81]);
  assertEquals(llamados, ["xml_pac", `facturas/${ruta}`]);
});
