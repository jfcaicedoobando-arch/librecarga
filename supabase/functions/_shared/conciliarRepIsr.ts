import { Decimal } from "npm:decimal.js@10.6.0";
import { parseCfdi } from "./cfdiParser.ts";
import type { DocumentoFacturapiIsr } from "./conciliarCfdiIsr.ts";
import { type ImpuestoRepIsr, verificarImpuestosRepIsr } from "./impuestosRepIsr.ts";
import type { PerfilCfdiOrigen } from "./perfilCfdiOrigen.ts";
import { atributo, importe, nodos, seccion } from "./xmlConciliacionCfdi.ts";

export interface PrevalidacionRepIsr {
  perfil: PerfilCfdiOrigen;
  pago: { fecha: string; moneda: string; monto: number; forma: string; tipo_cambio: number; referencia?: string | null };
  documento: {
    uuid: string;
    moneda: string;
    equivalencia: number;
    parcialidad: number;
    saldo_anterior: number;
    importe_pagado: number;
    saldo_insoluto: number;
    objeto_impuesto: "01" | "02";
    impuestos: ImpuestoRepIsr[];
  };
}

function verificarPago(esperado: PrevalidacionRepIsr, encabezado: string, relacionado: string) {
  const { pago, documento } = esperado;
  const fecha = atributo(encabezado, "FechaPago");
  const efectivo = importe(atributo(encabezado, "Monto"));
  const tipoCambio = importe(atributo(encabezado, "TipoCambioP") ?? (pago.moneda === "MXN" ? "1" : null));
  if (!fecha || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(fecha) || fecha.slice(0, 10) !== pago.fecha
    || atributo(encabezado, "FormaDePagoP") !== pago.forma || atributo(encabezado, "MonedaP") !== pago.moneda
    || (pago.referencia && atributo(encabezado, "NumOperacion") !== pago.referencia)
    || !efectivo.eq(pago.monto) || !tipoCambio.eq(pago.tipo_cambio) || !tipoCambio.gt(0)) {
    throw new Error("pago_rep_no_coincide");
  }

  const saldoAnterior = importe(atributo(relacionado, "ImpSaldoAnt"));
  const importePagado = importe(atributo(relacionado, "ImpPagado"));
  const saldoInsoluto = importe(atributo(relacionado, "ImpSaldoInsoluto"));
  const equivalencia = importe(atributo(relacionado, "EquivalenciaDR"));
  if (atributo(relacionado, "IdDocumento")?.toUpperCase() !== documento.uuid.toUpperCase()
    || atributo(relacionado, "MonedaDR") !== documento.moneda
    || atributo(relacionado, "ObjetoImpDR") !== documento.objeto_impuesto
    || !importe(atributo(relacionado, "NumParcialidad")).eq(documento.parcialidad)
    || !saldoAnterior.eq(documento.saldo_anterior) || !importePagado.eq(documento.importe_pagado)
    || !saldoInsoluto.eq(documento.saldo_insoluto) || !saldoAnterior.minus(importePagado).eq(saldoInsoluto)
    || !equivalencia.eq(documento.equivalencia) || !equivalencia.gt(0)
    || !importePagado.div(equivalencia).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).eq(efectivo)) {
    throw new Error("documento_relacionado_rep_no_coincide");
  }
  return { efectivo, equivalencia, tipoCambio };
}

/** Reads certified withholding in the invoice currency, before any conversion to the payment currency. */
export function conciliarRepIsr(
  esperado: PrevalidacionRepIsr, claim: string, remoto: DocumentoFacturapiIsr, xml: string,
) {
  const { perfil, documento, pago: cobro } = esperado;
  const uuid = remoto.uuid?.toUpperCase();
  if (!remoto.id || !uuid || !/^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(uuid)
    || remoto.status !== "valid" || remoto.type !== "P" || remoto.external_id !== claim
    || remoto.livemode !== (perfil.ambiente === "live") || !importe(remoto.total).isZero()
    || (remoto.organization != null && remoto.organization !== perfil.emisor.facturapiOrgId)) {
    throw new Error("respuesta_facturapi_rep_no_coincide");
  }

  const limpio = xml.replace(/<!--[\s\S]*?-->/g, "");
  const cfdi = parseCfdi(limpio);
  const comprobante = seccion(limpio, "Comprobante");
  const receptor = seccion(comprobante.contenido, "Receptor").etiqueta;
  const folio = atributo(comprobante.etiqueta, "Folio");
  const serie = atributo(comprobante.etiqueta, "Serie");
  if (atributo(comprobante.etiqueta, "Version") !== "4.0" || cfdi.uuid.toUpperCase() !== uuid
    || cfdi.tipo_comprobante !== "P" || cfdi.moneda !== "XXX"
    || !importe(atributo(comprobante.etiqueta, "SubTotal")).isZero() || !importe(atributo(comprobante.etiqueta, "Total")).isZero()
    || cfdi.emisor.rfc !== perfil.emisor.rfc || cfdi.emisor.regimen !== perfil.emisor.regimen
    || atributo(comprobante.etiqueta, "LugarExpedicion") !== perfil.emisor.cp
    || cfdi.receptor.rfc !== perfil.receptor.rfc || atributo(receptor, "RegimenFiscalReceptor") !== perfil.receptor.regimen_fiscal
    || atributo(receptor, "DomicilioFiscalReceptor") !== perfil.receptor.codigo_postal || atributo(receptor, "UsoCFDI") !== "CP01"
    || (folio != null && !importe(folio).eq(remoto.folio_number ?? -1))
    || (serie != null && serie !== (remoto.series ?? ""))) {
    throw new Error("identidad_o_cabecera_rep_no_coincide");
  }

  const complemento = seccion(comprobante.contenido, "Complemento");
  const timbre = seccion(complemento.contenido, "TimbreFiscalDigital").etiqueta;
  const pagos = seccion(complemento.contenido, "Pagos");
  if (atributo(timbre, "UUID")?.toUpperCase() !== uuid || nodos(limpio, "TimbreFiscalDigital").length !== 1
    || atributo(pagos.etiqueta, "Version") !== "2.0" || nodos(limpio, "Pagos").length !== 1) {
    throw new Error("complemento_rep_no_coincide");
  }
  const pago = seccion(pagos.contenido, "Pago");
  const relacionado = seccion(pago.contenido, "DoctoRelacionado");
  const totales = seccion(pagos.contenido, "Totales");
  const { efectivo, equivalencia, tipoCambio } = verificarPago(esperado, pago.etiqueta, relacionado.etiqueta);
  const retenciones = verificarImpuestosRepIsr({
    documento: relacionado.contenido, pago: pago.contenido, totales: totales.etiqueta, grupos: documento.impuestos,
    equivalencia, tipoCambioP: tipoCambio, efectivo,
  });
  return {
    uuid, factura_uuid: documento.uuid.toUpperCase(), emisor_rfc: cfdi.emisor.rfc, receptor_rfc: cfdi.receptor.rfc,
    moneda_pago: cobro.moneda, monto_recibido: efectivo.toNumber(), moneda_factura: documento.moneda,
    parcialidad: documento.parcialidad, saldo_anterior: documento.saldo_anterior, importe_pagado: documento.importe_pagado,
    saldo_insoluto: documento.saldo_insoluto, ...retenciones,
  };
}
