/** Bounded model of the reviewed dynamic patch, not a general SQL interpreter.
 * Source bytes and full preimages are mandatory. No mirror/snapshot is an input.
 * Runtime PostgreSQL replay remains authoritative for trigger/ACL/behavior checks.
 */
import { createHash } from "node:crypto";
import { huellaDefinicion, type indexarMigraciones } from "./replayMirror";
import { normalizeSql } from "./replayMirrorSql";

export const PATCH_0035 = "0035_cotizacion_aceptada_hasta_confirmar_embarque.sql";
const SOURCE_HASH = "9565c53c94e45d33bdf96242937dbaa0036dd7b122f0b7018739b0fe5128c277";
type Index = ReturnType<typeof indexarMigraciones>;
type JournalEntry = { idx: number; tag: string; when: number };
const patches = [
  { signature: "crear_embarque_borrador_core(uuid)", migration: "20261012224500_fix_conversion_puertos_uuid.sql",
    preimage: "010942b342450d07789d40d008f685296932ed78bd62294188ea641de6f3c663",
    old: "SET embarque_id = v_embarque_id, estado = 'En operación'::estado_cotizacion, updated_at = now()",
    next: "SET embarque_id = v_embarque_id, updated_at = now()", occurrences: 1 },
  { signature: "sync_cotizacion_embarque_link()", migration: "20260901001000_fix4_n1_papelera_libera_cotizacion.sql",
    preimage: "91dc157fab71e2277c2f4a21b589bd06abb30ca948a64ffde2870807a734cb5f",
    old: "NEW.estado <> 'Borrador'::estado_embarque",
    next: "NEW.estado NOT IN ('Borrador'::estado_embarque, 'Cotización'::estado_embarque, 'Cancelado'::estado_embarque)", occurrences: 2 },
] as const;

function verificarFuentePosterior(sources: ReadonlyMap<string, string>): void {
  // Reviewed0037 changes only the authorization guard and margin search_path;
  // it must not redefine either modeled0035 target. Pin exact bytes independently.
  const special = sources.get("0037_cotizacion_especial_trigger_permissions.sql");
  if (!special || createHash("sha256").update(special).digest("hex")
    !== "e398f843fa18c56f4cfd222d6329c24c3e259c406b817dbac2d7bab5fbb62eb0") {
    throw new Error("Drizzle0035: unreviewed later source");
  }
  // Reviewed0038 changes coordinator assignment, never either modeled target.
  const coordinator = sources.get("0038_coordinador_fijo_por_cliente.sql");
  if (!coordinator || createHash("sha256").update(coordinator).digest("hex")
    !== "6df25cd241868aea34f5d245db90ddc7de931b0fcce5268795eaf22706802c93") {
    throw new Error("Drizzle0035: unreviewed later source");
  }
  // Reviewed0039 only replaces the margin helper, never either modeled target.
  const margin = sources.get("0039_cotizacion_margen_moneda_homogenea.sql");
  if (!margin || createHash("sha256").update(margin).digest("hex")
    !== "4d20a86450c946c2d73845dbf41ff93d4fb93490243f8967737d1165bd163f79") {
    throw new Error("Drizzle0035: unreviewed later source");
  }
  const boundary = sources.get("0040_coordinador_permission_boundary.sql");
  if (!boundary || createHash("sha256").update(boundary).digest("hex")
    !== "b50b05b0f00dad9cac4ad6257ef8fa7676eca1a51e686513947e53425723fa6a") {
    throw new Error("Drizzle0035: unreviewed later source");
  }
  // Reviewed0041 only replaces the prospect trigger, never either modeled target.
  const prospect = sources.get("0041_prospecto_housekeeping_historicos.sql");
  if (!prospect || createHash("sha256").update(prospect).digest("hex")
    !== "4bc3ec9e2f34c10bd7091e8f1b9eb5e3458dce2b3f6d7664d8eec129fd27fd53") {
    throw new Error("Drizzle0035: unreviewed later source");
  }  // Reviewed0042–0048 apply legacy fixes outside both modeled targets.
  for (const [file, expected] of REVIEWED_FORWARD_FIXES) {
    const sql = sources.get(file);
    if (!sql || createHash("sha256").update(sql).digest("hex") !== expected) {
      throw new Error("Drizzle0035: unreviewed later source");
    }
  }
}

const FORWARD_0051_SHA256 = "0dd5e001a5a86dbb87e8f5c200fe2226ae2b948aebcc23ec9e795365de64e938";
const REVIEWED_FORWARD_FIXES: ReadonlyArray<readonly [string, string]> = [
  ["0042_periodo_cerrado_campos_derivados.sql", "f342ee211925de673df88f4bcc6343e0ca0a33c2cab34659fe0972b49d929d65"],
  ["0043_bitacora_no_falsificable.sql", "54de7ba7ff1cee2d1850a3db1557e991780b963351e0724d5729549eea8964ac"],
  ["0044_efe_xml_hash_unico_vivo.sql", "c8b73a21472318ffffaa5a9dcb7d5ce5160d80bee15668c82962c0b8d5bbe44f"],
  ["0045_provision_owner_sin_membresia.sql", "bd14472b11d4009f5439daf045e3703d0fe3910cb73dce650c160956e62c23b6"],
  ["0046_cerrar_funciones_internas_abiertas.sql", "fbb3f321e91f0ffb29098ff38e16c9ac0424d1f7c21ed9a5e97950e015d15001"],
  ["0047_rls_auth_uid_initplan_backport.sql", "49f067b89ca5bdbc31299d621e05279639862799d0892d71cbce3cb8ea09d22a"],
  ["0048_limpieza_indices_duplicados.sql", "9e135244f1f96d2b03e2abc35c3deb1efa3d44f3ee85162f52cf16eecfba7645"],
  ["0049_liquidaciones_lectura_finanzas_gerentes.sql", "7ba8e14da36f37a6559f05cf427a7d1e1e9dc495fed332b9f387f75c5d589d64"],
  ["0050_registrar_evento_tracking_embarque.sql", "da871c7f6eb9dfd3811302783470944a3c397167b09341efd7d617bb33db6753"],
  ["0051_procesamiento_facturapi_webhook.sql", FORWARD_0051_SHA256],
  ["0052_envios_proforma_recuperables.sql", "872fa26220264cf26cf2a85c0ae41b274e9361979540d76a8656502b0700faba"],
  ["0053_provision_membresia_atomica.sql", "4b519d836748bf04174aae1353f1ab160996904ff6d180b001e587c4b492231e"],
  ["0054_conteos_sidebar.sql", "3a3ffebc64c70e50b1619e24a2b7746975ff677477360d5b9fffe2ddee0ce1f8"],
  ["0055_embarques_paginacion_filtros.sql", "5cfc15700522c72741948cd7de594b9e573a1d0dbbd30a43cb67411be62ba9d1"],
  ["0056_facturacion_bandejas_ligeras.sql", "454907329cdf6a2b40f3937ebc9b0b3980af07bb1c9326e88e39d7d5493bad62"],
  // Pricing fingerprints/validation and broker objects do not redefine either0035 target.
  ["0057_pricing_vinculo_huella_rls_initplan.sql", "418eb056e2e30a488be88bf711259f462216fd1f16cb29feb1392237d5e5a7fd"],
  ["0058_pricing_faltantes_texto.sql", "3b0196cb6c7c9bcfd88a6b0622e90db76a17bcf36a0e8100313c3f6a69739686"],
  ["0059_broker_rol.sql", "d80bad1a5b76ba0e876b8b7c4622d2a26f7eda8bb3ea663b1d494f1cff86762c"],
  ["0060_brokers_fase1.sql", "fcf2fcc01c4c71d80224d962976f784bc682489b1a1531dee93834f1a4091084"],
  ["0061_broker_fuente_lead.sql", "f1fbf03a094b69149fc3d14286a3b7ecb2f7be64c718fbd1691a0109ffd2c60f"],
  ["0062_brokers_fase2.sql", "057122277de7e92edcfcad6c67511f384207b9769b9275fb999af88a66807e84"],
  ["0063_brokers_fase2_lecturas.sql", "8a8df55a3159251618bb2e6b2c82769827e959b7b7d06015f70b47c0eca9e1a7"],
  ["0064_brokers_fase3_comisiones.sql", "f4a4e3b36bdeb884554a340ed686bf1d9c746b8e851c6ce39e4a5aac2cdbcc51"],
  //0065 only adds the four restrictive tenant policies.
  ["0065_brokers_tenant_scope.sql", "5b8a4cf0909e4df7c578bdd601a56cdb49bd8cc41738bc21e55081bd5e849b89"],
  // Independent invoice reads, trigger ACL closure and the fiscal-profile domain;
  // none redefines either quotation/shipment function modeled by this module.
  ["0066_facturas_filtros_globales.sql", "ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f"],
  ["0067_broker_trigger_acl.sql", "c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9"],
  ["0068_perfil_fiscal_emisor.sql", "b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1"],
  ["0069_isr_resico_contrato.sql", "7975e33aa3d03aaaa4838aef8cf56aeb77472843aa67347f2d9b540358f83aae"],
  ["0070_factura_resico_totales_agrupados.sql", "04a26c4b1d084b4a98d7d41f5a71db0f15d6f30a34933e4c6b4c7899be3f956c"],
  ["0071_isr_resico_cotizacion_embarque.sql", "685e1ec8bc30f56771d8284089f37fa0a363df8d71a2b0d0da389f0411f14104"],
  ["0072_isr_resico_revision_embarque.sql", "5204233d11421deda09b914b71e746b2607e89ac5a849f00e0633e26b58a3871"],
  ["0073_isr_resico_proforma_normal.sql", "dd198ea737366b1a53d121c426b90603df582fc2c9f7334fff9a62682ad6ae8f"],
  ["0074_isr_resico_consolidacion_proformas.sql", "331b1e84456ee357c4c67dc8c490762316d8ebb3ba2bb9f62031ac4c63e86fbd"],
  ["0075_isr_resico_conversion_proforma.sql", "c9d7455fbc7373c50577ac5fb6e715d28467b4508c2effd4ecf75f93a9ae7b9e"],
  ["0076_isr_resico_factura_manual.sql", "3ac5dcd38f14c52fe11199a0791be62c6796d71f3defd133b5be8ea2de827c8b"],
  ["0077_isr_resico_intentos_timbrado.sql", "b88e723859b4a9398edcf50f19c0b348b93f22d7d3a952f213dd7c872efcbd80"],
  ["0078_isr_resico_recuperar_timbrado.sql", "8430edc3ef77b9b76072095a7ce1a4f8a87338291146a2ba7d376956bb3e9283"],
  ["0079_isr_resico_cobranza.sql", "1fc2d8d6ce3704a4523d8f71f287adedd931f6c4aceb85ace433d3d382461ef0"],
];

function verificarOrdenJournal(sources: ReadonlyMap<string, string>, journal: JournalEntry[]): void {
  // The caller verifies every isolated source/mirror against HISTORY. Require
  // the actual current journal order too; a later migration needs fresh review.
  const current = journal.slice(26);
  const ordered = [...sources.keys()].filter(file => Number(file.slice(0, 4)) >= 26);
  const expectedTail = [PATCH_0035.slice(0, -4),
    "0036_cotizacion_handover_tenant_scope", "0037_cotizacion_especial_trigger_permissions",
    "0038_coordinador_fijo_por_cliente", "0039_cotizacion_margen_moneda_homogenea",
    "0040_coordinador_permission_boundary", "0041_prospecto_housekeeping_historicos",
    ...REVIEWED_FORWARD_FIXES.map(([file]) => file.slice(0, -4))];
  if (journal.length !== 35 + expectedTail.length || current.some((entry, offset) => entry.idx !== offset + 26
    || `${entry.tag}.sql` !== ordered[offset] || entry.when <= journal[entry.idx - 1].when)
    || current.length !== ordered.length || expectedTail.some((tag, offset) => journal[35 + offset]?.tag !== tag)) {
    throw new Error("Drizzle0035: unsupported source/journal order");
  }
}

export function aplicarDrizzle0035(index: Index, sources: ReadonlyMap<string, string>, journal: JournalEntry[]): Index {
  const sql = sources.get(PATCH_0035);
  if (!sql || createHash("sha256").update(sql).digest("hex") !== SOURCE_HASH) {
    throw new Error("Drizzle0035: unsupported or missing patch source");
  }
  verificarOrdenJournal(sources, journal);
  verificarFuentePosterior(sources);
  const result = new Map(index);
  for (const patch of patches) {
    const previous = index.get(patch.signature);
    if (!previous || previous.migracion !== patch.migration
      || huellaDefinicion(previous.definicion) !== patch.preimage) {
      throw new Error(`Drizzle0035: preimage changed for ${patch.signature}`);
    }
    const parts: string[] = JSON.parse(previous.definicion.cuerpo);
    const before = normalizeSql(patch.old);
    if (parts.length !== 3 || parts[1].split(before).length - 1 !== patch.occurrences) {
      throw new Error(`Drizzle0035: unexpected replacement count for ${patch.signature}`);
    }
    // SQL replace changes every occurrence. All declaration attributes remain.
    parts[1] = parts[1].split(before).join(normalizeSql(patch.next));
    result.set(patch.signature, { migracion: `drizzle/migrations/${PATCH_0035}`,
      definicion: { ...previous.definicion, cuerpo: JSON.stringify(parts) } });
  }
  return result;
}
