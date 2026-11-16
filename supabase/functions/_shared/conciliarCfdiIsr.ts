import { Decimal } from "npm:decimal.js@10.6.0";
import { decodeXmlEntities, parseCfdi } from "./cfdiParser.ts";
import { normalizarUsoCfdi } from "./usoCfdiEfectivo.ts";

export interface TotalesIsr {
  moneda: string;
  subtotal: number;
  iva: number;
  ret_isr: number;
  ret_iva: number;
  total: number;
}

export interface PrevalidacionTimbradoIsr {
  ambiente: "sandbox" | "live";
  tipo?: "I" | "E";
  factura_uuid?: string;
  tasas_iva_retenido?: number[];
  emisor: { facturapi_org_id: string; rfc: string; regimen_fiscal: string; codigo_postal?: string };
  receptor: { rfc: string; regimen_fiscal: string; nombre?: string; codigo_postal?: string };
  datos_factura: { tipo_cambio: number | null; uso_cfdi?: string; metodo_pago?: string; forma_pago?: string; serie?: string | null };
  totales: TotalesIsr;
}

export interface DocumentoFacturapiIsr {
  id?: string;
  uuid?: string;
  external_id?: string;
  livemode?: boolean;
  organization?: string;
  status?: string;
  type?: string;
  folio_number?: number;
  series?: string;
  currency?: string;
  total?: number;
}

function atributo(nodo: string, nombre: string): string | null {
  const valor = new RegExp(`\\s${nombre}\\s*=\\s*(["'])([^"'<>]*?)\\1`, "i").exec(nodo)?.[2];
  return valor == null ? null : decodeXmlEntities(valor);
}

function importe(valor: string | number | null | undefined): Decimal {
  if (valor == null || !/^\d+(?:\.\d+)?$/.test(String(valor))) throw new Error("importe_cfdi_invalido");
  return new Decimal(valor);
}

function nodos(xml: string, nombre: string): string[] {
  return xml.match(new RegExp(`<(?:[\\w.-]+:)?${nombre}(?=[\\s/>])[^>]*>`, "gi")) ?? [];
}

function impuestosRaiz(xml: string) {
  const encabezados = nodos(xml, "Impuestos").filter((nodo) =>
    atributo(nodo, "TotalImpuestosTrasladados") != null || atributo(nodo, "TotalImpuestosRetenidos") != null);
  if (encabezados.length > 1) throw new Error("impuestos_cfdi_ambiguos");
  const cabecera = encabezados[0];
  if (!cabecera) {
    const declarados = [...nodos(xml, "Retencion"), ...nodos(xml, "Traslado")];
    if (declarados.some((nodo) => !importe(atributo(nodo, "Importe") ?? 0).isZero())) {
      throw new Error("impuestos_cfdi_sin_cabecera");
    }
    return { iva: 0, ret_isr: 0, ret_iva: 0 };
  }

  const inicio = xml.indexOf(cabecera) + cabecera.length;
  const hijos = cabecera.endsWith("/>") ? "" : xml.slice(inicio).split(/<\/(?:[\w.-]+:)?Impuestos\s*>/i, 1)[0];
  const iva = importe(atributo(cabecera, "TotalImpuestosTrasladados") ?? 0);
  const retenido = importe(atributo(cabecera, "TotalImpuestosRetenidos") ?? 0);
  let isr = new Decimal(0);
  let ivaRet = new Decimal(0);
  let traslados = new Decimal(0);
  for (const nodo of nodos(hijos, "Retencion")) {
    const codigo = atributo(nodo, "Impuesto");
    if (codigo === "001") isr = isr.plus(importe(atributo(nodo, "Importe")));
    else if (codigo === "002") ivaRet = ivaRet.plus(importe(atributo(nodo, "Importe")));
    else throw new Error("retencion_cfdi_desconocida");
  }
  for (const nodo of nodos(hijos, "Traslado")) {
    if (atributo(nodo, "Impuesto") !== "002") throw new Error("traslado_cfdi_desconocido");
    const monto = atributo(nodo, "Importe");
    if (monto != null) traslados = traslados.plus(importe(monto));
    else if (atributo(nodo, "TipoFactor") !== "Exento") throw new Error("traslado_cfdi_sin_importe");
  }
  if (!isr.plus(ivaRet).eq(retenido) || !traslados.eq(iva)) throw new Error("impuestos_cfdi_no_cuadran");
  if ([iva, isr, ivaRet].some((monto) => monto.decimalPlaces() > 2)) throw new Error("impuesto_cfdi_no_exacto");
  return { iva: iva.toNumber(), ret_isr: isr.toNumber(), ret_iva: ivaRet.toNumber() };
}

function coincidenDatosXml(
  esperado: PrevalidacionTimbradoIsr, remoto: DocumentoFacturapiIsr, encabezado: string, receptor: string,
) {
  const datos = esperado.datos_factura;
  const serie = atributo(encabezado, "Serie");
  const folio = atributo(encabezado, "Folio");
  return (!esperado.emisor.codigo_postal || atributo(encabezado, "LugarExpedicion") === esperado.emisor.codigo_postal)
    && (!esperado.receptor.codigo_postal || atributo(receptor, "DomicilioFiscalReceptor") === esperado.receptor.codigo_postal)
    && (!datos.uso_cfdi || normalizarUsoCfdi(atributo(receptor, "UsoCFDI")) === datos.uso_cfdi)
    && (!datos.forma_pago || atributo(encabezado, "FormaPago") === datos.forma_pago)
    && (!datos.metodo_pago || atributo(encabezado, "MetodoPago") === datos.metodo_pago)
    && (!datos.serie || remoto.series === datos.serie)
    && (serie == null || serie === (remoto.series ?? ""))
    && (folio == null || (/^\d+$/.test(folio) && Number(folio) === remoto.folio_number));
}

export function conciliarCfdiIsr(
  esperado: PrevalidacionTimbradoIsr,
  claim: string,
  remoto: DocumentoFacturapiIsr,
  xml: string,
) {
  const uuid = remoto.uuid?.toUpperCase();
  const tipo = esperado.tipo ?? "I";
  if (remoto.status !== "valid" || remoto.type !== tipo || remoto.external_id !== claim
    || remoto.livemode !== (esperado.ambiente === "live") || remoto.currency !== esperado.totales.moneda
    || !remoto.id || !uuid || !Number.isSafeInteger(remoto.folio_number) || Number(remoto.folio_number) <= 0
    || !importe(remoto.total).eq(esperado.totales.total)
    || (remoto.organization != null && remoto.organization !== esperado.emisor.facturapi_org_id)) {
    throw new Error("respuesta_facturapi_no_coincide");
  }

  const documento = xml.replace(/<!--[\s\S]*?-->/g, "");
  const cfdi = parseCfdi(documento);
  const encabezado = nodos(documento, "Comprobante")[0] ?? "";
  const receptor = nodos(documento, "Receptor")[0] ?? "";
  const regimenReceptor = atributo(receptor, "RegimenFiscalReceptor");
  const uso = normalizarUsoCfdi(atributo(receptor, "UsoCFDI"));
  if (cfdi.uuid.toUpperCase() !== uuid || cfdi.tipo_comprobante !== tipo || cfdi.moneda !== esperado.totales.moneda
    || cfdi.emisor.rfc !== esperado.emisor.rfc || cfdi.emisor.regimen !== esperado.emisor.regimen_fiscal
    || cfdi.receptor.rfc !== esperado.receptor.rfc || regimenReceptor !== esperado.receptor.regimen_fiscal || !uso
    || !coincidenDatosXml(esperado, remoto, encabezado, receptor)
    || (cfdi.moneda !== "MXN" && !importe(atributo(encabezado, "TipoCambio")).eq(esperado.datos_factura.tipo_cambio ?? 0))
    || !importe(atributo(encabezado, "SubTotal")).eq(esperado.totales.subtotal)
    || !importe(atributo(encabezado, "Total")).eq(esperado.totales.total)) {
    throw new Error("identidad_o_cabecera_xml_no_coincide");
  }
  if (tipo === "E") verificarRelacionEgreso(documento, esperado.factura_uuid);
  const impuestos = impuestosRaiz(documento);
  if (impuestos.iva !== esperado.totales.iva || impuestos.ret_isr !== esperado.totales.ret_isr
    || impuestos.ret_iva !== esperado.totales.ret_iva) throw new Error("impuestos_xml_no_coinciden");
  const conceptosXml = /<(?:[\w.-]+:)?Conceptos(?=[\s>])[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Conceptos\s*>/i.exec(documento)?.[1] ?? "";
  const retenciones = nodos(conceptosXml, "Retencion");
  const retencionesIsr = retenciones.filter((nodo) => atributo(nodo, "Impuesto") === "001");
  if ((impuestos.ret_isr > 0 && !retencionesIsr.length)
    || retencionesIsr.some((nodo) => !importe(atributo(nodo, "TasaOCuota")).eq(".0125"))) {
    throw new Error("tasa_isr_xml_no_coincide");
  }
  if (esperado.tasas_iva_retenido) verificarTasasIvaRetenido(retenciones, esperado.tasas_iva_retenido);
  return {
    uuid, emisor_rfc: cfdi.emisor.rfc, emisor_regimen: cfdi.emisor.regimen, receptor_rfc: cfdi.receptor.rfc,
    receptor_regimen: regimenReceptor, uso_cfdi: uso, totales: { ...esperado.totales, ...impuestos },
  };
}

function verificarTasasIvaRetenido(retenciones: string[], esperadas: number[]) {
  const tasas = new Set(retenciones.filter((nodo) => atributo(nodo, "Impuesto") === "002")
    .map((nodo) => importe(atributo(nodo, "TasaOCuota")).toString()));
  if (tasas.size !== esperadas.length || !esperadas.every((tasa) => tasas.has(importe(tasa).toString()))) {
    throw new Error("tasa_iva_retenido_xml_no_coincide");
  }
}

function verificarRelacionEgreso(xml: string, facturaUuid: string | undefined) {
  const relacion = /<((?:[\w.-]+:)?CfdiRelacionados)(?=[\s>])[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(xml);
  const origen = nodos(relacion?.[2] ?? "", "CfdiRelacionado");
  if (!facturaUuid || !relacion || atributo(relacion[0].slice(0, relacion[0].indexOf(">") + 1), "TipoRelacion") !== "01"
    || nodos(xml, "CfdiRelacionados").length !== 1 || origen.length !== 1
    || atributo(origen[0], "UUID")?.toUpperCase() !== facturaUuid.toUpperCase()) {
    throw new Error("cfdi_egreso_relacion_no_coincide");
  }
}
