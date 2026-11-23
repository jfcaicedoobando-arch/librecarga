/** Provider arithmetic probe only; never proves RESICO eligibility for a 601 issuer.
 * POST /invoices/preview/pdf does not stamp or save: https://docs.facturapi.io/api/
 * Credentials come exclusively from environment; no Supabase access or invoice creation.
 * Requires FACTURAPI_SANDBOX_QA_KEY, FACTURAPI_SANDBOX_EXPECTED_ORG_ID,
 * and PDFTOTEXT_PATH (trusted local executable). Raw PDFs/text/errors never reach stdout.
 */
import { consultarPerfilProveedor } from "../../supabase/functions/_shared/facturapiPerfilProveedor.ts";
import { basicAuthHeader, FACTURAPI_BASE } from "../../supabase/functions/_shared/facturapiAuth.ts";
import { buildFacturapiPayload, type ConceptoInterno } from "../../supabase/functions/facturapi-emitir/helpers.ts";
import { recalcularTotalesFacturapi } from "../../supabase/functions/_shared/cuadreFacturapi.ts";
import { clasificarCoherenciaIva } from "../../supabase/functions/_shared/coherenciaIva.ts";
import { extraerPdf, PdfPreviewError } from "./resico-preview-pdf.ts";
export { montosPdf } from "./resico-preview-pdf.ts";

interface CasoPreview { caso: string; precio: number; cantidad: number; renglones: number; conceptos?: ConceptoInterno[] }
function concepto(precio: number, tipo: NonNullable<ConceptoInterno["tipo_iva"]> = "gravado_16", isr = 0.0125, retIva = 0): ConceptoInterno {
  return { descripcion: "Prueba aritmetica sin timbrado", cantidad: 1, precio_unitario: precio,
    clave_sat: "78101800", clave_unidad: "E48", unidad: "Servicio", tipo_iva: tipo,
    tasa_iva: clasificarCoherenciaIva({ tipo_iva: tipo, aplica_iva: true }).tasa,
    tasa_ret_isr: isr, tasa_ret_iva: retIva };
}
export const CASOS_PREVIEW: readonly CasoPreview[] = [
  { caso: "base_10000", precio: 10000, cantidad: 1, renglones: 1 },
  { caso: "precision_raw", precio: 100.3996, cantidad: 1, renglones: 1 },
  { caso: "base_normalizada", precio: 100.40, cantidad: 1, renglones: 1 },
  { caso: "cantidad_fraccionaria", precio: 40.15984, cantidad: 2.5, renglones: 1 },
  { caso: "dos_renglones", precio: 100.40, cantidad: 1, renglones: 2 },
  { caso: "subtotal_tras_suma", precio: 100.0049, cantidad: 1, renglones: 2,
    conceptos: [concepto(100.0049, "tasa_0"), concepto(100.0049, "tasa_0")] },
  { caso: "iva_tasas_mixtas", precio: 50.04, cantidad: 1, renglones: 2,
    conceptos: [concepto(50.04), concepto(100.08, "gravado_8")] },
  { caso: "isr_tasas_mixtas", precio: 100.40, cantidad: 1, renglones: 2,
    conceptos: [concepto(100.40, "tasa_0"), concepto(12.55, "tasa_0", 0.1)] },
  { caso: "retenciones_coexistentes", precio: 100.375, cantidad: 1, renglones: 2,
    conceptos: [concepto(100.375, "gravado_16", 0.0125, 0.04), concepto(100.375, "gravado_16", 0.0125, 0.04)] },
];

export function conceptosPreview(caso: CasoPreview): ConceptoInterno[] {
  return caso.conceptos ?? Array.from({ length: caso.renglones }, () => ({ ...concepto(caso.precio), cantidad: caso.cantidad }));
}
export function payloadCasoPreview(caso: CasoPreview) {
  return payloadPreview(caso.precio, caso.cantidad, caso.renglones, conceptosPreview(caso));
}
export function compararPreview(montos: Awaited<ReturnType<typeof extraerPdf>>, conceptos: ConceptoInterno[]) {
  const esperado = recalcularTotalesFacturapi(conceptos);
  return { esperado, coincide: montos.total === esperado.total.toFixed(2) &&
    (montos.subtotal === null || montos.subtotal === esperado.subtotal.toFixed(2)) };
}

export function payloadPreview(precio: number, cantidad = 1, renglones = 1, conceptos?: ConceptoInterno[]) {
  // Inline fictional recipient from Facturapi's official API examples. No customer ID.
  return buildFacturapiPayload({
    forma_pago: "03", metodo_pago: "PUE", uso_cfdi: "G03", moneda: "MXN", tipo_cambio: 1,
    receptor: { legal_name: "Dunder Mifflin", tax_id: "ABC101010111", tax_system: "601", address: { zip: "86500" } },
    conceptos: conceptos ?? Array.from({ length: renglones }, () => ({ descripcion: "Prueba aritmetica sin timbrado", cantidad, precio_unitario: precio,
      clave_sat: "78101800", clave_unidad: "E48", unidad: "Servicio", tipo_iva: "gravado_16",
      tasa_iva: clasificarCoherenciaIva({ tipo_iva: "gravado_16", aplica_iva: true }).tasa,
      tasa_ret_isr: 0.0125, tasa_ret_iva: 0 })),
  });
}

function validarEntrada(key: string | undefined, orgId: string | undefined): asserts key is string {
  if (!key || !/^sk_test_\S+$/.test(key) || key.trim() !== key) throw new Error("sandbox_required");
  if (!orgId || orgId.trim() !== orgId || orgId.length > 100) throw new Error("org_required");
}

async function analizarPdf(pdf: Uint8Array, extraer: typeof extraerPdf) {
  try { return { success: true as const, ...await extraer(pdf) }; }
  catch (error) {
    const diagnostico = error instanceof PdfPreviewError ? { code: error.code, lineas: error.lineas } : { code: "pdf_extract", lineas: [] };
    return { success: false as const, diagnostico };
  }
}

export async function verificarPreview(
  key: string | undefined, expectedOrgId: string | undefined,
  deps = { request: fetch, extraer: extraerPdf },
) {
  const resultados: Array<{ caso: string; precio: number; cantidad: number; renglones: number; sha256: string; localTotal?: number; comparacion?: ReturnType<typeof compararPreview> } & Awaited<ReturnType<typeof analizarPdf>>> = [];
  let stage = "input";
  let status: number | null = null;
  try {
    validarEntrada(key, expectedOrgId);
    stage = "profile";
    const perfil = await consultarPerfilProveedor(key, deps.request);
    if (perfil.facturapi_org_id !== expectedOrgId || perfil.regimen_fiscal !== "601" || perfil.rfc?.length !== 12) throw new Error("profile_mismatch");
    for (const caso of CASOS_PREVIEW) {
      stage = "preview";
      const response = await deps.request(`${FACTURAPI_BASE}/invoices/preview/pdf`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: basicAuthHeader(key), "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify(payloadCasoPreview(caso)),
      });
      status = response.status;
      if (!response.ok) { await response.body?.cancel(); throw new Error("preview_rejected"); }
      const pdf = new Uint8Array(await response.arrayBuffer());
      if (new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") throw new Error("pdf_required");
      stage = "extract";
      const montos = await analizarPdf(pdf, deps.extraer);
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdf)), (n) => n.toString(16).padStart(2, "0")).join("");
      const comparacion = montos.success ? compararPreview(montos, conceptosPreview(caso)) : undefined;
      resultados.push({ caso: caso.caso, precio: caso.precio, cantidad: caso.cantidad, renglones: caso.renglones,
        sha256, ...montos, localTotal: comparacion?.esperado.total, comparacion });
    }
    return { success: resultados.every((r) => r.success && r.comparacion?.coincide), stage: "complete", status, resultados };
  } catch (error) {
    const diagnostico = error instanceof PdfPreviewError ? { code: error.code, lineas: error.lineas } : undefined;
    return { success: false, stage, status, resultados, diagnostico };
  }
}

if (import.meta.main) {
  try {
    const result = await verificarPreview(Deno.env.get("FACTURAPI_SANDBOX_QA_KEY"), Deno.env.get("FACTURAPI_SANDBOX_EXPECTED_ORG_ID"));
    console.log(JSON.stringify(result));
    if (!result.success) Deno.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ success: false, stage: "environment", status: null, resultados: [] }));
    Deno.exitCode = 1;
  }
}
