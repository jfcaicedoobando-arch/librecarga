import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { revisarBorradorIsr, validarEmisorFacturapi, type PrevalidacionIsr } from "./isrPreflight.ts";
import { validarCuadreFiscal } from "./contextoCuadre.ts";

const factura = { id: "f-qa", organization_id: "org-libre-qa", cliente_id: "c-qa", evaluacion_fiscal: {},
  updated_at: "2026-11-15T15:02:01.123456+00:00" };
const emisor = { facturapi_org_id: "org-pac-qa", rfc: "GODE561231GR8", regimen_fiscal: "626",
  codigo_postal: "01000", razon_social: "QA" };
const esperado: PrevalidacionIsr = { ambiente: "sandbox", emisor };
const credenciales = { apiKey: "llave-sintetica", ambiente: "sandbox", facturapiOrgId: emisor.facturapi_org_id };
const armarConsulta = (data: unknown, error: { code: string } | null = null) => ({
  rpc: (nombre: string, argumentos: { p_factura_id: string }) => {
    assertEquals(nombre, "prevalidar_emision_isr_factura");
    assertEquals(argumentos.p_factura_id, factura.id);
    return Promise.resolve({ data, error });
  },
}) as unknown as SupabaseClient;

Deno.test("prevalidación ISR verifica factura y organización y protege borradores sin evaluación", async () => {
  const captura = { ...esperado, factura_id: factura.id, organization_id: factura.organization_id,
    factura_actualizada_at: factura.updated_at, receptor: { rfc: "EKU9003173C9", regimen_fiscal: "601" },
    datos_factura: { tipo_cambio: 1 },
    totales: { moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 0, total: 230.42 } };
  assertEquals(await revisarBorradorIsr(armarConsulta(captura), factura), { ...esperado, captura });
  const desactualizada = await revisarBorradorIsr(armarConsulta(captura),
    { ...factura, updated_at: "2026-11-15T15:02:01.123499+00:00" });
  assert(desactualizada instanceof Response);
  assertEquals(desactualizada.status, 409);
  const cruzada = await revisarBorradorIsr(armarConsulta({ ...captura, organization_id: "otra" }), factura);
  assert(cruzada instanceof Response);
  assertEquals(cruzada.status, 503);
  const noEvaluada = await revisarBorradorIsr(armarConsulta(null, { code: "23514" }), { ...factura, evaluacion_fiscal: null });
  assert(noEvaluada instanceof Response);
  assertEquals(noEvaluada.status, 409);
  assertEquals(await revisarBorradorIsr(armarConsulta(null), { ...factura, evaluacion_fiscal: null }), null);
});

Deno.test("prevalidación ISR usa sólo la llave del ambiente y organización aprobados", async () => {
  let consultas = 0;
  const consultar = (apiKey: string) => {
    consultas++;
    assertEquals(apiKey, credenciales.apiKey);
    return Promise.resolve({ ...emisor, razon_social: "QA" });
  };
  const ambiente = await validarEmisorFacturapi(esperado, { ...credenciales, ambiente: "live" }, consultar);
  const organizacion = await validarEmisorFacturapi(esperado, { ...credenciales, facturapiOrgId: "otra" }, consultar);
  assert(ambiente instanceof Response);
  assert(organizacion instanceof Response);
  assertEquals(ambiente.status, 409);
  assertEquals(organizacion.status, 409);
  assertEquals(consultas, 0);
  assertEquals(await validarEmisorFacturapi(esperado, credenciales, consultar), emisor);
  assertEquals(consultas, 1);
});

Deno.test("prevalidación ISR rechaza identidad devuelta que difiere del perfil aprobado", async () => {
  for (const cambio of [{ facturapi_org_id: "otra" }, { rfc: "AAA010101AA0" }, { regimen_fiscal: "601" }, { codigo_postal: "02000" }]) {
    const bloqueo = await validarEmisorFacturapi(esperado, credenciales,
      () => Promise.resolve({ ...emisor, razon_social: "QA", ...cambio }));
    assert(bloqueo instanceof Response);
    assertEquals(bloqueo.status, 409);
  }
  const error = await validarEmisorFacturapi(esperado, credenciales, () => Promise.reject(new Error("simulado")));
  assert(error instanceof Response);
  assertEquals(error.status, 503);
});

Deno.test("cuadre de un borrador fiscal sin ISR conserva redondeo agrupado de IVA", () => {
  const linea = { descripcion: "Flete", cantidad: 1, precio_unitario: 100.4, clave_sat: "78101800",
    tipo_iva: "gravado_16" as const, tasa_iva: .16, tasa_ret_isr: 0, tasa_ret_iva: 0 };
  const header = { ...factura, estado: "Borrador", subtotal: 200.8, iva: 32.13, total: 232.93, ret_isr: 0, ret_iva: 0 };
  assertEquals(validarCuadreFiscal([linea, linea], header), null);
  const diferencias = validarCuadreFiscal([linea, linea], { ...header, iva: 32.12, total: 232.92 });
  assertEquals(diferencias?.status, 422);
});
