import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verificarPreview, montosPdf, CASOS_PREVIEW, payloadCasoPreview, conceptosPreview, compararPreview } from "../../../scripts/qa/resico-sandbox-preview.ts";
import { diagnosticoMontos, PdfPreviewError } from "../../../scripts/qa/resico-preview-pdf.ts";

const profile = { id: "org-a", legal: { tax_id: "ABC101010111", tax_system: "601" } };
const pdf = new TextEncoder().encode("%PDF-fixture");
const amounts = { subtotal: "10000.00", total: "11475.00" };
function verificarMontos(texto: string) {
  const actual = montosPdf(texto);
  assertEquals(actual, amounts);
}

Deno.test("preview accepts vertical subtotal without guessing and requires unique labelled total", async () => {
  assertEquals(montosPdf("Subtotal\n200.80\nIVA\nISR 1.25%\nTotal 230.42"), { subtotal: null, total: "230.42" });
  assertEquals(montosPdf("Subtotal 100.00 200.00\nTotal 230.42"), { subtotal: null, total: "230.42" });
  await assertRejects(async () => montosPdf("Subtotal 200.80\nTotal\n230.42"));
  await assertRejects(async () => montosPdf("Total 230.42 230.43"));
});

Deno.test("preview compares totals exactly against grouped Edge calculation without inferring missing subtotal", () => {
  const conceptos = conceptosPreview(CASOS_PREVIEW[4]);
  assertEquals(compararPreview({ subtotal: null, total: "230.42" }, conceptos).coincide, true);
  assertEquals(compararPreview({ subtotal: "200.80", total: "230.42" }, conceptos).coincide, true);
  assertEquals(compararPreview({ subtotal: null, total: "230.43" }, conceptos).coincide, false);
  assertEquals(compararPreview({ subtotal: "200.79", total: "230.42" }, conceptos).coincide, false);
});

Deno.test("preview vectors preserve the five established cases and distinguish grouping hypotheses", () => {
  assertEquals(CASOS_PREVIEW.slice(0, 5).map((c) => c.caso), ["base_10000", "precision_raw", "base_normalizada", "cantidad_fraccionaria", "dos_renglones"]);
  const totales = CASOS_PREVIEW.slice(5).map((c) => compararPreview({ subtotal: null, total: "0.00" }, conceptosPreview(c)).esperado);
  assertEquals(totales[0].total, 197.51);
  assertEquals(totales[1].iva_trasladado, 16.02);
  assertEquals(totales[2].ret_isr, 2.52);
  assertEquals(totales[3].ret_iva, 8.03);
});

Deno.test("preview succeeds only when every observed total matches grouped Edge", async () => {
  const request: typeof fetch = (url) => Promise.resolve(String(url).endsWith("/me") ? Response.json(profile) : new Response(pdf));
  let index = 0;
  const result = await verificarPreview("sk_test_fake", "org-a", { request, extraer: async () => {
    const esperado = compararPreview({ subtotal: null, total: "0.00" }, conceptosPreview(CASOS_PREVIEW[index++])).esperado;
    return { subtotal: null, total: esperado.total.toFixed(2) };
  } });
  assertEquals(result.success, true);
  assertEquals(result.resultados.length, CASOS_PREVIEW.length);
  assert(result.resultados.every((r) => r.comparacion?.coincide));
});

Deno.test("preview sandbox blocks live keys and missing org before network", async () => {
  let calls = 0;
  const request: typeof fetch = () => { calls++; throw new Error("must not call"); };
  for (const [key, org] of [["sk_live_fake", "org-a"], ["sk_test_fake", ""], [" sk_test_fake", "org-a"]]) {
    assertEquals((await verificarPreview(key, org, { request, extraer: async () => amounts })).success, false);
  }
  assertEquals(calls, 0);
});

Deno.test("preview rejects wrong org or changed issuer before POST", async () => {
  for (const body of [{ ...profile, id: "org-b" }, { ...profile, legal: { ...profile.legal, tax_system: "626" } }]) {
    let calls = 0;
    const request: typeof fetch = () => { calls++; return Promise.resolve(Response.json(body)); };
    assertEquals((await verificarPreview("sk_test_fake", "org-a", { request, extraer: async () => amounts })).success, false);
    assertEquals(calls, 1);
  }
});

Deno.test("preview uses only GET me and all nonpersistent PDF POSTs with production builder", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(calls.length === 1 ? Response.json(profile) : new Response(pdf));
  };
  const result = await verificarPreview("sk_test_fake", "org-a", { request, extraer: async () => amounts });
  assertEquals(result.success, false); // Identical mocked totals must fail the distinct-case comparison.
  assertEquals(calls.map((c) => new URL(c.url).pathname), ["/v2/organizations/me", ...Array(CASOS_PREVIEW.length).fill("/v2/invoices/preview/pdf")]);
  assertEquals(calls.slice(1).map((c) => c.init?.method), Array(CASOS_PREVIEW.length).fill("POST"));
  assertEquals(calls.slice(1).map((c) => JSON.parse(String(c.init?.body))), CASOS_PREVIEW.map(payloadCasoPreview));
  assertEquals(result.resultados.length, CASOS_PREVIEW.length);
  assert(result.resultados.every((r) => /^[a-f0-9]{64}$/.test(r.sha256)));
  const output = JSON.stringify(result);
  for (const forbidden of ["sk_test", "ABC101010111", "org-a", "%PDF"]) assert(!output.includes(forbidden));
});

Deno.test("preview rejection and network errors never expose raw provider content or retry", async () => {
  for (const failure of [() => new Response("secret provider body", { status: 422 }), () => { throw new Error("secret key"); }]) {
    let calls = 0;
    const request: typeof fetch = () => { calls++; return Promise.resolve(calls === 1 ? Response.json(profile) : failure()); };
    const result = await verificarPreview("sk_test_fake", "org-a", { request, extraer: async () => amounts });
    assertEquals(result.success, false);
    assertEquals(calls, 2);
    assert(!JSON.stringify(result).includes("secret"));
  }
});

Deno.test("preview extracts only labelled amounts and rejects ambiguous totals", async () => {
  verificarMontos("PRIVATE HEADER\nSubtotal  $10,000.00\nISR 1.25%  $125.00\nIVA16% $1600.00\nTotal $11,475.00 MXN\n".replace("IVA16", "IVA 16"));
  await assertRejects(async () => montosPdf("Subtotal $10.00\nISR $1.00\nTotal $9.00\nTotal $9.00"));
});

Deno.test("preview PDF handles columns, signed withholding and amounts without currency", () => {
  verificarMontos("PRIVATE\nAnother column    Subtotal: 10,000.00\n    Ret. ISR 1.25%    -125.00\nIVA 16% 1600.00\n    Total: 11,475.00 MXN");
  verificarMontos("Subtotal $10,000.00    ISR retenido (1.25%) -$125.00    IVA16% $1600.00    Total $11,475.00".replace("IVA16", "IVA 16"));
});

Deno.test("preview reports only observed subtotal and total despite vertical tax columns", () => {
  verificarMontos("Subtotal 10000.00\nISR base10000.00\nIVA 1600.00\nTotal 11475.00");
  verificarMontos("Subtotal 10000.00\n125.00 ISR 1.25% base 10000.00\n1600.00 IVA 16% base 10000.00\nTotal 11475.00");
  const result = montosPdf("Subtotal 100.40\n1.25 ISR 1.25% base 100.40\n16.06 IVA 16% base 100.40\nTotal 115.21");
  assertEquals(result, { subtotal: "100.40", total: "115.21" });
  verificarMontos("ISR 10000.00\nSubtotal 10000.00\nRet. ISR\n125.00\nTotal 11475.00");
});

Deno.test("preview PDF diagnostic contains only fixed labels and decimal amounts", () => {
  const safe = diagnosticoMontos("RFC ABC101010111 SECRET NAME\nSubtotal SECRET 100.00 200.00\nISR 1.25% SECRET 1.26\nTotal SECRET 114.00");
  assertEquals(safe, [
    { etiqueta: "subtotal", cantidades: ["100.00", "200.00"] },
    { etiqueta: "ret_isr", cantidades: ["1.26"] },
    { etiqueta: "total", cantidades: ["114.00"] },
  ]);
});

Deno.test("preview distinguishes typed PDF failures without leaking exception text", async () => {
  const request: typeof fetch = (url) => Promise.resolve(String(url).endsWith("/me") ? Response.json(profile) : new Response(pdf));
  for (const code of ["pdf_limit", "pdf_temp", "pdf_launch", "pdf_exit", "pdf_parse"] as const) {
    const result = await verificarPreview("sk_test_fake", "org-a", { request, extraer: () => { throw new PdfPreviewError(code); } });
    assertEquals(result.success, false);
    assertEquals(result.resultados.length, CASOS_PREVIEW.length);
    assert(result.resultados.every((r) => !r.success));
    assertEquals(result.resultados[0].diagnostico, { code, lineas: [] });
  }
});

Deno.test("preview preserves remaining observations after an individual extraction failure", async () => {
  const request: typeof fetch = (url) => Promise.resolve(String(url).endsWith("/me") ? Response.json(profile) : new Response(pdf));
  let extracted = 0;
  const result = await verificarPreview("sk_test_fake", "org-a", { request, extraer: async () => {
    extracted++;
    if (extracted === 2) throw new PdfPreviewError("pdf_parse");
    return amounts;
  } });
  assertEquals(result.success, false);
  assertEquals(result.resultados.map((r) => r.success), CASOS_PREVIEW.map((_, index) => index !== 1));
  const last = result.resultados[4];
  assert(last.success);
  assertEquals(last.total, "11475.00");
});
