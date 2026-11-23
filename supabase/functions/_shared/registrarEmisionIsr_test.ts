import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { conciliarYRegistrarIsr, obtenerIntentoIsr } from "./registrarEmisionIsr.ts";

const uuid = "2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88";
const xml = `<cfdi:Comprobante Version="4.0" TipoDeComprobante="I" Moneda="MXN" SubTotal="100.00" Total="114.75">
  <cfdi:Emisor Rfc="GODE561231GR8" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="EKU9003173C9" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos><cfdi:Concepto Cantidad="1" Importe="100.00" ValorUnitario="100.00">
    <cfdi:Impuestos><cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" TasaOCuota="0.012500" Importe="1.25"/>
    </cfdi:Retenciones></cfdi:Impuestos>
  </cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="16.00" TotalImpuestosRetenidos="1.25">
    <cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="1.25"/></cfdi:Retenciones>
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="16.00"/></cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento>
</cfdi:Comprobante>`;

function fixture() {
  const registros: Array<{ p_estado: string; p_resultado: Record<string, unknown> }> = [];
  const archivos: string[] = [];
  const admin = {
    rpc: (nombre: string, argumentos: typeof registros[number]) => {
      assertEquals(nombre, "registrar_resultado_timbrado_isr");
      registros.push(argumentos);
      return Promise.resolve({ data: { estado: argumentos.p_estado }, error: null });
    },
    storage: {
      from: (bucket: string) => {
        assertEquals(bucket, "facturas");
        return { upload: (ruta: string) => {
          archivos.push(ruta);
          return Promise.resolve({ error: null });
        } };
      },
    },
  } as unknown as SupabaseClient;
  const input: Parameters<typeof conciliarYRegistrarIsr>[0] = {
    admin, facturaId: "f-qa", organizationId: "org-libre-qa", claim: "PENDING:qa", apiKey: "llave-sintetica",
    esperado: { ambiente: "sandbox", emisor: { facturapi_org_id: "org-pac-qa", rfc: "GODE561231GR8", regimen_fiscal: "626" },
      receptor: { rfc: "EKU9003173C9", regimen_fiscal: "601" }, datos_factura: { tipo_cambio: 1 },
      totales: { moneda: "MXN", subtotal: 100, iva: 16, ret_isr: 1.25, ret_iva: 0, total: 114.75 } },
    remoto: { id: "invoice-qa", uuid, external_id: "PENDING:qa", livemode: false, type: "I", status: "valid",
      currency: "MXN", total: 114.75, folio_number: 77 },
  };
  return { input, registros, archivos };
}

Deno.test("confirma después de cotejar y respaldar el XML de la misma factura", async () => {
  const { input, registros, archivos } = fixture();
  const resultado = await conciliarYRegistrarIsr(input, (url, init) => {
    assertEquals(url, "https://www.facturapi.io/v2/invoices/invoice-qa/xml");
    assertEquals(init?.redirect, "error");
    return Promise.resolve(new Response(xml));
  });
  assertEquals(resultado, { estado: "confirmado", registrado: true });
  assertEquals(archivos, [`org-libre-qa/emitidas/${uuid}.xml`]);
  const evidencia = registros[0].p_resultado.xml as { ruta: string; sha256: string };
  assertEquals(evidencia.ruta, archivos[0]);
  assertMatch(evidencia.sha256, /^[a-f0-9]{64}$/);
});

Deno.test("un XML descuadrado o aún no disponible conserva el identificador remoto", async () => {
  const { input, registros, archivos } = fixture();
  const descuadre = await conciliarYRegistrarIsr(input, () => Promise.resolve(new Response(xml.replace("1.25", "1.20").replace('Total="114.75"', 'Total="114.80"'))));
  const pendiente = await conciliarYRegistrarIsr(input, () => Promise.resolve(new Response(null, { status: 404 })));
  assertEquals(descuadre.estado, "conciliacion");
  assertEquals(pendiente.estado, "pendiente");
  assertEquals(registros.map((r) => r.p_resultado.facturapi_id), ["invoice-qa", "invoice-qa"]);
  assertEquals(archivos.length, 0);
});

Deno.test("una respuesta de otro intento conserva la reserva sin adoptar otro comprobante", async () => {
  const { input, registros } = fixture();
  input.remoto.external_id = "PENDING:otro";
  input.remoto.status = "pending";
  const resultado = await conciliarYRegistrarIsr(input, () => { throw new Error("no debe descargar"); });
  assertEquals(resultado.estado, "conciliacion");
  assertEquals(registros[0].p_resultado.facturapi_id, undefined);
});

Deno.test("la recuperación sólo acepta la prevalidación de su factura y organización", async () => {
  const { input } = fixture();
  let org = input.organizationId;
  const admin = {
    rpc: (nombre: string, argumentos: Record<string, string>) => {
      assertEquals(nombre, "obtener_intento_timbrado_isr");
      assertEquals(argumentos, {
        p_factura_id: input.facturaId, p_organization_id: input.organizationId, p_claim: input.claim,
      });
      return Promise.resolve({ data: { facturapi_id: "invoice-qa",
        prevalidacion: { ...input.esperado, factura_id: input.facturaId, organization_id: org } }, error: null });
    },
  } as unknown as SupabaseClient;
  assertEquals((await obtenerIntentoIsr({ ...input, admin }))?.facturapiId, "invoice-qa");
  org = "otro-tenant";
  assertEquals(await obtenerIntentoIsr({ ...input, admin }), null);
});
