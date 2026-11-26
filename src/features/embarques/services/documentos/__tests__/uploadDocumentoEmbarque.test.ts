import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadDocumentoEmbarque } from "@/features/embarques/services/documentos/uploadDocumentoEmbarque";

import { sha256Hex } from "../idempotencyHash";

const storage = vi.hoisted(() => ({ uploadFile: vi.fn(), downloadFile: vi.fn() }));

const state: {
  selectResult: { data: { archivo: string | null; estado: string } | null; error: null };
  rpcClaim: unknown;
  updateResult: { data: Array<{ id: string }> | null; error: Error | null };
  updateEqCalls: string[];
} = {
  selectResult: { data: null, error: null },
  rpcClaim: { __idempotency_pending: true },
  updateResult: { data: [{ id: "doc-1" }], error: null },
  updateEqCalls: [],
};

vi.mock("@/services/storage/index", () => storage);
vi.mock("@/services/bitacora/registrar", () => ({
  registrarActividad: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/integrations/supabase/client", () => {
  // Un solo builder chainable: `mode` distingue el SELECT inicial del UPDATE
  // posterior, ya que ambos comparten `.eq()` pero terminan en promesas distintas.
  let mode: "select" | "update" = "select";
  const builder = {
    select: vi.fn(() => {
      if (mode === "update") return Promise.resolve(state.updateResult);
      return builder;
    }),
    update: vi.fn(() => {
      mode = "update";
      return builder;
    }),
    eq: vi.fn((_col: string, v: string) => {
      if (mode === "update") state.updateEqCalls.push(v);
      return builder;
    }),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(state.selectResult)),
  };
  return {
    supabase: {
      from: vi.fn(() => {
        mode = "select";
        return builder;
      }),
      rpc: vi.fn((fn: string) => {
        if (fn === "idempotency_claim") return Promise.resolve({ data: state.rpcClaim, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

function makeFile(name = "a.pdf", content = "contenido"): File {
  return new File([content], name, { type: "application/pdf" });
}

beforeEach(() => {
  state.selectResult = { data: null, error: null };
  state.rpcClaim = { __idempotency_pending: true };
  state.updateResult = { data: [{ id: "doc-1" }], error: null };
  state.updateEqCalls = [];
  vi.clearAllMocks();
});

async function pathDe(file: File) {
  const hash = await sha256Hex(file);
  return `embarques/e1/d1/${hash.slice(0, 12)}-${file.name}`;
}

describe("recuperación de carga documental", () => {
  beforeEach(() => {
    storage.uploadFile.mockReset().mockResolvedValue(undefined);
    storage.downloadFile.mockReset().mockRejectedValue(new Error("archivo ausente"));
  });

  it("reutiliza el blob tras perder la respuesta de Storage", async () => {
    const archivo = makeFile();
    state.selectResult = { data: { archivo: null, estado: "Pendiente" }, error: null };
    storage.uploadFile.mockRejectedValueOnce(new Error("respuesta perdida"));
    storage.downloadFile.mockResolvedValueOnce(archivo);
    const path = await pathDe(archivo);
    await expect(uploadDocumentoEmbarque("e1", "d1", archivo)).resolves.toMatchObject({ path });
    expect(storage.downloadFile).toHaveBeenCalledWith(path);
    expect(state.updateEqCalls).toContain("d1");
  });

  it("repara un blob ausente cuando la fila ya apunta a ese path", async () => {
    const archivo = makeFile();
    const path = await pathDe(archivo);
    state.selectResult = { data: { archivo: path, estado: "Recibido" }, error: null };
    await expect(uploadDocumentoEmbarque("e1", "d1", archivo)).resolves.toMatchObject({ path, cached: false });
    expect(storage.uploadFile).toHaveBeenCalledWith(path, archivo);
  });

  it("recupera el acuse perdido de un UPDATE que sí quedó aplicado", async () => {
    const archivo = makeFile();
    const path = await pathDe(archivo);
    state.selectResult = { data: { archivo: path, estado: "Recibido" }, error: null };
    state.updateResult = { data: null, error: new Error("respuesta perdida") };
    await expect(uploadDocumentoEmbarque("e1", "d1", archivo)).resolves.toMatchObject({ path });
  });

  it("rechaza una subida fallida cuando el archivo existente tiene otro contenido", async () => {
    state.selectResult = { data: { archivo: null, estado: "Pendiente" }, error: null };
    storage.uploadFile.mockRejectedValueOnce(new Error("conflicto de Storage"));
    storage.downloadFile.mockResolvedValueOnce(makeFile("a.pdf", "otro contenido"));
    await expect(uploadDocumentoEmbarque("e1", "d1", makeFile())).rejects.toThrow("conflicto de Storage");
    expect(state.updateEqCalls).toHaveLength(0);
  });
});
