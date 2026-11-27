import { describe, expect, it } from "vitest";
import type * as Sentry from "@sentry/react";
import { shouldDropSentryEvent } from "../dropPredicate";

const ev = (extra: Partial<Sentry.ErrorEvent> = {}) => ({ type: undefined, ...extra }) as Sentry.ErrorEvent;
const drop = (err: unknown, e = ev()) => shouldDropSentryEvent(e, { originalException: err });

describe("avisos de negocio de Sentry (nov 2026)", () => {
  it.each([
    "LC_PRICING_INCOMPLETA: Submodalidad",
    "LC_CONCEPTO_PROFORMADO: el concepto ya está incluido en una proforma",
    "LC_PERIODO_CERRADO: el periodo contable está cerrado hasta el 2026-08-31",
    "LC_TRASPASO_CUENTA_INACTIVA: ambas cuentas deben estar activas",
    "Faltan campos obligatorios: Submodalidad, Commodity.",
    "Este proveedor está pendiente de aprobación por Contabilidad",
    "not_found",
  ])("descarta %s", (msg) => expect(drop(new Error(msg))).toBe(true));

  it("descarta el 500 del script de analítica del hosting", () => {
    const e = ev({ request: { url: "https://librecarga.com/__l5e/trackevents" } });
    expect(drop(new Error("HTTP Client Error with status code: 500"), e)).toBe(true);
  });

  it("sigue reportando errores reales", () => {
    expect(drop(new Error("not_found en la consulta de embarques"))).toBe(false);
    expect(drop(new SyntaxError("Unexpected token '{'"))).toBe(false);
  });
});
