/**
 * R3 · P3 — sentry-tunnel: tope de tamaño del envelope (413).
 * Endpoint público que antes leía el body completo en memoria sin límite.
 *
 * Run: deno test --no-check supabase/functions/sentry-tunnel/index_test.ts
 */
// @ts-nocheck — Deno runtime.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { excedeContentLength, MAX_ENVELOPE_BYTES } from "./envelope.ts";
import { handleEnvelopeRequest } from "./handler.ts";

Deno.test("P3: excedeContentLength corta bodies declarados > 1 MB", () => {
  const grande = new Request("https://x/", {
    method: "POST",
    headers: { "content-length": String(MAX_ENVELOPE_BYTES + 1) },
  });
  assert(excedeContentLength(grande));
  const justo = new Request("https://x/", {
    method: "POST",
    headers: { "content-length": String(MAX_ENVELOPE_BYTES) },
  });
  assert(!excedeContentLength(justo));
  const sinHeader = new Request("https://x/", { method: "POST" });
  assert(!excedeContentLength(sinHeader));
});

Deno.test("P3: el handler responde 413 y no usa req.text() sin tope", async () => {
  const response = await handleEnvelopeRequest(new Request("https://mock.invalid/tunnel", {
    method: "POST", body: new Uint8Array(MAX_ENVELOPE_BYTES + 1),
  }));
  assertEquals(response.status, 413);
  assertEquals(await response.text(), "payload_too_large");
});
