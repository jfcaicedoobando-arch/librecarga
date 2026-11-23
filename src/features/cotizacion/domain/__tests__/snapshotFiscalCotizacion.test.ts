import { describe, expect, it } from "vitest";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import { exigirFiscalCotizacionParaEnvio, fiscalCotizacionParaDocumento, leerSnapshotFiscalCotizacion } from "../snapshotFiscalCotizacion";

const document = (evaluacion_fiscal: unknown) => ({ organization_id: "org-a", cliente_id: null, estado: "Borrador", evaluacion_fiscal });
describe("snapshot fiscal canónico de cotización", () => {
  it("distingue histórico, marcador de revisión y datos inválidos sin inferir importes", () => {
    expect(leerSnapshotFiscalCotizacion(null).estado).toBe("legacy");
    expect(leerSnapshotFiscalCotizacion({ ambiente: "sandbox", regla_version: "v1" }).estado).toBe("revision");
    expect(leerSnapshotFiscalCotizacion({}).estado).toBe("invalido");
  });
  it("preserva el desglose aprobado de dos renglones, sin recalcular por renglón", () => {
    const fiscal = fiscalCotizacionFixture();
    expect(fiscalCotizacionParaDocumento(document(fiscal))).toEqual(fiscal);
  });
  it("rechaza descuadre y monedas duplicadas", () => {
    const fiscal = fiscalCotizacionFixture();
    expect(leerSnapshotFiscalCotizacion({ ...fiscal, bloques: [{ ...fiscal.bloques[0], total: 230.4 }] }).estado).toBe("invalido");
    expect(leerSnapshotFiscalCotizacion({ ...fiscal, bloques: [...fiscal.bloques, ...fiscal.bloques] }).estado).toBe("invalido");
  });
  it.each([{ organization_id: "org-b" }, { cliente_id: "otro" }])("rechaza identidad ajena %j", (other) => {
    expect(() => fiscalCotizacionParaDocumento(document(fiscalCotizacionFixture(other)))).toThrow("no corresponde");
  });
  it("permite borrador provisional pero bloquea envío y documento definitivo", () => {
    const cot = document(fiscalCotizacionFixture({ estado: "pendiente" }));
    expect(fiscalCotizacionParaDocumento(cot).estado).toBe("pendiente");
    expect(() => exigirFiscalCotizacionParaEnvio(cot)).toThrow("pendiente");
    expect(() => fiscalCotizacionParaDocumento({ ...cot, estado: "Enviada" })).toThrow("revisión fiscal");
  });
});
