import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { sharedDependencyViolations } from "./helpers/sharedDependencyGraph";

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "librecarga-ui-deps-"));
  try {
    writeFileSync(join(root, "tsconfig.app.json"), JSON.stringify({
      compilerOptions: { paths: { "@/*": ["./src/*"] }, module: "ESNext", moduleResolution: "bundler" },
      include: ["src"],
    }));
    for (const [relative, source] of Object.entries(files)) {
      const file = join(root, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    return sharedDependencyViolations(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("dependencias transitivas de la UI compartida", () => {
  it("mantiene los módulos de negocio fuera de la cadena de imports de producción", () => {
    const { runtime, types } = sharedDependencyViolations(process.cwd());
    expect.soft(runtime, runtime.join("\n")).toEqual([]);
    expect(types, types.join("\n")).toEqual([]);
  });

  it("sigue imports de efecto lateral, aliases, reexportaciones y cargas literales aunque haya ciclos", () => {
    const { runtime, types } = fixture({
      "src/components/shared/Panel.ts": 'import "@/lib/bridge";',
      "src/lib/bridge/index.ts": 'export * from "./nested.js";',
      "src/lib/bridge/nested.ts": [
        'import "./index";',
        'void import("@/features/facturacion/queryKeys");',
        'require("../../features/embarques/queryKeys");',
      ].join("\n"),
      "src/features/facturacion/queryKeys.ts": "export const key = 1;",
      "src/features/embarques/queryKeys.ts": "export const key = 2;",
    });
    const prefix = "src/components/shared/Panel.ts:1 (import @/lib/bridge) → src/lib/bridge/index.ts:1 (export ./nested.js) → ";
    expect(runtime).toEqual([
      prefix + "src/lib/bridge/nested.ts:2 (import() @/features/facturacion/queryKeys) → src/features/facturacion/queryKeys.ts",
      prefix + "src/lib/bridge/nested.ts:3 (require() ../../features/embarques/queryKeys) → src/features/embarques/queryKeys.ts",
    ]);
    expect(types).toEqual([]);
  });

  it("informa los caminos con imports o reexportaciones de tipos por separado", () => {
    const { runtime, types } = fixture({
      "src/components/shared/Panel.ts": [
        'import { type Factura } from "@/lib/contracts";',
        'export type Contacto = import("@/lib/contacts").Contacto;',
      ].join("\n"),
      "src/lib/contracts.ts": 'export type { Factura } from "@/features/facturacion/contracts";',
      "src/lib/contacts.ts": 'export { type Contacto } from "@/features/cliente/contracts";',
      "src/features/facturacion/contracts.ts": "export type Factura = string;",
      "src/features/cliente/contracts.ts": "export type Contacto = string;",
    });
    expect(runtime).toEqual([]);
    expect(types).toEqual([
      "src/components/shared/Panel.ts:1 (tipo @/lib/contracts) → src/lib/contracts.ts:1 (tipo @/features/facturacion/contracts) → src/features/facturacion/contracts.ts",
      "src/components/shared/Panel.ts:2 (tipo @/lib/contacts) → src/lib/contacts.ts:1 (tipo @/features/cliente/contracts) → src/features/cliente/contracts.ts",
    ]);
  });

  it("autoriza el servicio exacto de autenticación y sigue recorriendo sus dependencias", () => {
    const files = {
      "src/components/shared/Panel.ts": 'import "@/lib/contexts/auth/useAuthSession";',
      "src/lib/contexts/auth/useAuthSession.ts": 'import "@/features/auth/services/session";',
      "src/features/auth/services/session.ts": "export const session = 1;",
    };
    expect(fixture(files)).toEqual({ runtime: [], types: [] });
    const { runtime } = fixture({
      ...files,
      "src/features/auth/services/session.ts": 'import "@/lib/auth/bridge";',
      "src/lib/auth/bridge.ts": [
        'export * from "@/features/cliente/queryKeys";',
        'export * from "@/features/auth/routes/Login";',
      ].join("\n"),
      "src/features/cliente/queryKeys.ts": "export const key = 1;",
      "src/features/auth/routes/Login.ts": "export const login = 1;",
    });
    const prefix = "src/components/shared/Panel.ts:1 (import @/lib/contexts/auth/useAuthSession) → "
      + "src/lib/contexts/auth/useAuthSession.ts:1 (import @/features/auth/services/session) → "
      + "src/features/auth/services/session.ts:1 (import @/lib/auth/bridge) → ";
    expect(runtime).toEqual([
      prefix + "src/lib/auth/bridge.ts:1 (export @/features/cliente/queryKeys) → src/features/cliente/queryKeys.ts",
      prefix + "src/lib/auth/bridge.ts:2 (export @/features/auth/routes/Login) → src/features/auth/routes/Login.ts",
    ]);
  });

  it("exige que el origen de la excepción también esté autorizado", () => {
    const { runtime } = fixture({
      "src/components/shared/Panel.ts": 'import "@/lib/bridge";',
      "src/lib/bridge.ts": 'export * from "@/features/auth/services/session";',
      "src/features/auth/services/session.ts": "export const session = 1;",
    });
    expect(runtime).toEqual([
      "src/components/shared/Panel.ts:1 (import @/lib/bridge) → src/lib/bridge.ts:1 (export @/features/auth/services/session) → src/features/auth/services/session.ts",
    ]);
  });
});
