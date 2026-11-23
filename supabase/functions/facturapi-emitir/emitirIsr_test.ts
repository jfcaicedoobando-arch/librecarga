import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { emitirFacturaConIsr } from "./emitirIsr.ts";
import type { FacturaContext, FacturapiPayload } from "./helpers.ts";

const claim = "PENDING:bf75e8e7-53a3-44c8-8d6d-231f1eae35d3";
const uuid = "2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88";
const emisor = { facturapi_org_id: "org-fapi-qa", rfc: "GODE561231GR8", regimen_fiscal: "626",
  codigo_postal: "01000", razon_social: "EMISOR QA" };
const receptor = { nombre: "RECEPTOR QA", rfc: "EKU9003173C9", regimen_fiscal: "601", codigo_postal: "01010" };
const datos_factura = { uso_cfdi: "G03", metodo_pago: "PPD", forma_pago: "99", tipo_cambio: 1, serie: "QA" };
const totales = { moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 0, total: 230.42 };
const timbre = { id: "inv-qa", external_id: claim, uuid, livemode: false, type: "I", status: "valid",
  currency: totales.moneda, total: totales.total, folio_number: 78, series: "QA" };

const concepto = { descripcion: "Flete QA", cantidad: 1, precio_unitario: 100.4,
  clave_sat: "78101800", tasa_iva: .16, tasa_ret_isr: .0125 };
const ctx: FacturaContext = { ...datos_factura, moneda: "MXN", conceptos: [concepto, concepto],
  receptor: { tax_id: receptor.rfc, tax_system: receptor.regimen_fiscal, legal_name: receptor.nombre,
    address: { zip: receptor.codigo_postal } } };
const linea = `<cfdi:Concepto Cantidad="1" ValorUnitario="100.40" Importe="100.40">
  <cfdi:Impuestos><cfdi:Retenciones><cfdi:Retencion Impuesto="001" TasaOCuota="0.012500" Importe="1.255000"/>
  </cfdi:Retenciones></cfdi:Impuestos></cfdi:Concepto>`;
const xml = `<cfdi:Comprobante Version="4.0" TipoDeComprobante="I" Moneda="MXN" SubTotal="200.80" Total="230.42"
  FormaPago="99" MetodoPago="PPD" LugarExpedicion="01000" Serie="QA" Folio="78">
  <cfdi:Emisor Rfc="${emisor.rfc}" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="${receptor.rfc}" RegimenFiscalReceptor="601" UsoCFDI="G03" DomicilioFiscalReceptor="01010"/>
  <cfdi:Conceptos>${linea}${linea}</cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="32.13" TotalImpuestosRetenidos="2.51">
    <cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="2.51"/></cfdi:Retenciones>
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="32.13"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento></cfdi:Comprobante>`;

function fixture(fallo?: number) {
  const llamadas: string[] = [];
  const registros: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: (nombre: string, args: Record<string, unknown>) => {
      llamadas.push(nombre);
      registros.push(args);
      const data = nombre === "reservar_timbrado_isr" ? { claim } : { estado: args.p_estado };
      return Promise.resolve({ data, error: null });
    },
    storage: { from: () => ({ upload: () => { llamadas.push("respaldo"); return Promise.resolve({ error: null }); } }) },
  } as unknown as SupabaseClient;
  const factura = { id: "factura-qa", organization_id: "librecarga-qa", cliente_id: "cliente-qa" };
  const ambiente = "sandbox" as const;
  const input = { admin, factura, actorId: "actor-qa", emisorObservado: emisor, ctx, apiKey: "key-sandbox-qa",
    prevalidacion: { ambiente, emisor, captura: { ambiente, emisor, receptor, datos_factura, totales } },
    facturapi: { invoices: { create: (payload: FacturapiPayload) => {
      llamadas.push("crear");
      assertEquals(payload.external_id, claim);
      assertEquals(payload.idempotency_key, claim);
      for (const item of payload.items) {
        assert(item.product.taxes?.some(t => t.type === "ISR" && t.rate === .0125 && t.withholding));
      }
      if (fallo) return Promise.reject({ status: fallo, message: "Error simulado" });
      return Promise.resolve(timbre);
    } } } };
  return { llamadas, registros, input };
}

Deno.test("emisión ISR reserva una vez, envía ambas referencias y confirma el XML de $230.42", async () => {
  const { llamadas, registros, input } = fixture();
  const res = await emitirFacturaConIsr(input, (url) => {
    assertEquals(url, "https://www.facturapi.io/v2/invoices/inv-qa/xml");
    llamadas.push("descargar");
    return Promise.resolve(new Response(xml));
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).uuid, uuid);
  assertEquals(llamadas, ["reservar_timbrado_isr", "crear", "descargar", "respaldo", "registrar_resultado_timbrado_isr"]);
  assertEquals(registros[1].p_estado, "confirmado");
});

Deno.test("emisión ISR conserva la reserva ante errores ambiguos o el XML de otro domicilio fiscal", async () => {
  for (const fallo of [409, 503]) {
    const { input, registros } = fixture(fallo);
    assertEquals((await emitirFacturaConIsr(input)).status, 202);
    assertEquals(registros[1].p_estado, "pendiente");
  }
  const { input, registros, llamadas } = fixture();
  const res = await emitirFacturaConIsr(input,
    () => Promise.resolve(new Response(xml.replace('DomicilioFiscalReceptor="01010"', 'DomicilioFiscalReceptor="01020"'))));
  assertEquals(res.status, 202);
  assertEquals(registros[1].p_estado, "conciliacion");
  assert(!llamadas.includes("respaldo"));
});

Deno.test("emisión ISR distingue rechazo explícito y datos cambiados antes de reservar", async () => {
  const { input, registros, llamadas } = fixture(422);
  assertEquals((await emitirFacturaConIsr(input)).status, 422);
  assertEquals(registros[1].p_estado, "rechazado");
  llamadas.length = 0;
  const cambiado = { ...input, ctx: { ...input.ctx, forma_pago: "03" } };
  assertEquals((await emitirFacturaConIsr(cambiado)).status, 409);
  assertEquals(llamadas, []);
});
