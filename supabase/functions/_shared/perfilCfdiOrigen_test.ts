import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { perfilCfdiOrigen, verificarLlaveCfdiOrigen } from "./perfilCfdiOrigen.ts";

const factura = {
  organization_id: "org-qa", cliente_id: "cliente-qa", ambiente: "sandbox", evaluacion_fiscal: {},
  snapshot_emision: {
    evaluacion_fiscal: {},
    organizacion_snapshot: { id: "org-qa", facturapi_org_id: "pac-qa", rfc: "GODE561231GR8",
      regimen_fiscal: "626", codigo_postal: "01000" },
    cliente_snapshot: { id: "cliente-qa", nombre: "PM QA", rfc: "EKU9003173C9", regimen_fiscal: "601", codigo_postal: "01010" },
  },
};

Deno.test("el documento derivado conserva el emisor, receptor y ambiente del comprobante original", () => {
  const origen = perfilCfdiOrigen(factura, "org-qa");
  assert(origen && origen !== "incompleto");
  assertEquals(origen.ambiente, "sandbox");
  assertEquals(origen.receptor.codigo_postal, "01010");
  assertEquals(origen.receptor.rfc, "EKU9003173C9");
  assertEquals(perfilCfdiOrigen(factura, "otras-org"), "incompleto");
  assertEquals(perfilCfdiOrigen({ ...factura, snapshot_emision: null }, "org-qa"), "incompleto");
  assertEquals(perfilCfdiOrigen({ ...factura, evaluacion_fiscal: null }, "org-qa"), null);
});

Deno.test("el complemento usa una llave del mismo ambiente y con la identidad fiscal emitida", async () => {
  const origen = perfilCfdiOrigen(factura, "org-qa");
  assert(origen && origen !== "incompleto");
  const key = { apiKey: "llave-sintetica", ambiente: "sandbox", facturapiOrgId: "pac-qa" };
  const observado = { facturapi_org_id: "pac-qa", rfc: "GODE561231GR8", regimen_fiscal: "626",
    codigo_postal: "01000", razon_social: "QA" };
  assertEquals(await verificarLlaveCfdiOrigen(origen, key, () => Promise.resolve(observado)), true);
  assertEquals(await verificarLlaveCfdiOrigen(origen, key, () => Promise.resolve({ ...observado, regimen_fiscal: "612" })), false);
  let consultas = 0;
  const consultar = () => { consultas++; return Promise.resolve(observado); };
  assertEquals(await verificarLlaveCfdiOrigen(origen, { ...key, ambiente: "live" }, consultar), false);
  assertEquals(await verificarLlaveCfdiOrigen(origen, { ...key, facturapiOrgId: "otra-org" }, consultar), false);
  assertEquals(consultas, 0);
});
