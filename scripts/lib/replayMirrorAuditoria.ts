import { createHash } from "node:crypto";
import { huellaDefinicion, type indexarMigraciones } from "./replayMirror";
import { normalizeSql } from "./replayMirrorSql";

type Index = ReturnType<typeof indexarMigraciones>;
const PATCH = "20260829195613_5ad1e7e9-aa72-45b6-853d-d501eaa097d3.sql";
const PATCH_SHA256 = "4d0b95a1873eb5eaed77496a8f8ce448e5b304e855d4005c94ff7ebe1b458f36";
const FIRMA = "_audit_embarques_agregar(jsonb,jsonb)";
const PREIMAGEN = "26d59037ac8efe4ec46eeba30a68cf47901c3a5de6b542aebe6446f8a0226076";
const ANCLA = "'venta_total_descuadrado', COUNT(*) FILTER (WHERE h->>'regla' = 'venta_total_descuadrado')";
const CONTEO = "'contenedores_totales_descuadrados', COUNT(*) FILTER (WHERE h->>'regla' = 'contenedores_totales_descuadrados')";

/** Reflect the verified legacy M-10 patch for the aggregator only. */
export function aplicarReplayMirrorAuditoria(index: Index, migrations: ReadonlyMap<string, string>): Index {
  const previous = index.get(FIRMA);
  if (previous && previous.migracion > PATCH) return index;

  const patch = migrations.get(PATCH);
  if (!patch || createHash("sha256").update(patch.replace(/\r\n/g, "\n")).digest("hex") !== PATCH_SHA256) {
    throw new Error("Auditoría M-10: cambió la migración histórica");
  }
  if (!previous || huellaDefinicion(previous.definicion) !== PREIMAGEN) {
    throw new Error("Auditoría M-10: cambió la preimagen del agregador");
  }

  const parts: string[] = JSON.parse(previous.definicion.cuerpo);
  const anchor = normalizeSql(ANCLA);
  if (parts.length !== 3 || parts[1].split(anchor).length !== 2) {
    throw new Error("Auditoría M-10: el ancla del conteo debe aparecer una sola vez");
  }
  parts[1] = parts[1].replace(anchor, () => normalizeSql(`${ANCLA}, ${CONTEO}`));
  const result = new Map(index);
  result.set(FIRMA, { migracion: PATCH, definicion: { ...previous.definicion, cuerpo: JSON.stringify(parts) } });
  return result;
}
