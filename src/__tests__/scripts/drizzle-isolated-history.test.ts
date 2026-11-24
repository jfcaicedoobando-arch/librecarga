import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HISTORY, listIsolatedHistory, readIsolatedDrizzleReplay } from "../../../scripts/ci/drizzle-history/control.mjs";
import { extraerFunciones } from "../../../scripts/lib/replayMirrorFunctions";
import { scanDrizzleReplay, type DrizzleReplayEntry } from "../../../scripts/lib/audit-drizzle-replay";

const roots: string[] = [];
const read = (file: string) => readFileSync(file, "utf8");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "drizzle-isolated-"));
  roots.push(root);
  for (const dir of ["scripts/ci/drizzle-history", "drizzle/migrations", "supabase/migrations"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  cpSync("scripts/ci/drizzle-history", join(root, "scripts/ci/drizzle-history"), { recursive: true });
  cpSync("drizzle/replay.json", join(root, "drizzle/replay.json"));
  for (const item of HISTORY.filter(item => item.eligibleName)) {
    cpSync(`drizzle/migrations/${item.file}`, join(root, "drizzle/migrations", item.file));
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("isolated Drizzle history is not deployment-eligible", () => {
  it("requires the pinned preimages and rejects a copy in deployable migrations", () => {
    const root = fixture();
    const preimages = join(root, "scripts/ci/drizzle-history/preconditions/authority-0092-0094.sql");
    const misplaced = join(root, "supabase/migrations/20990101000000_authority_preimages.sql");
    cpSync(preimages, misplaced);
    expect(() => listIsolatedHistory(root)).toThrow(/must not be deployment-eligible/);
    rmSync(misplaced);
    writeFileSync(preimages, read(preimages) + "\n-- changed preimages");
    expect(() => listIsolatedHistory(root)).toThrow(/Isolated history hash mismatch/);
  });

  it("verifies immutable order, archived collision provenance and the effective body", () => {
    const paths = listIsolatedHistory();
    expect(paths.map(path => path.split("/").at(-1))).toEqual([
      "0021_refacturar_proforma_rpc.sql", "0022_refacturar_proforma_abre_edicion.sql",
      "0022_cotizacion_comercial.sql", "0023_margen_minimo_utilidad_rpc.sql",
      "0026_comisiones_recalcular_al_asignar_vendedora.sql", "0027_clientes_tipo_cliente.sql",
      "0028_pricing_tipo_operacion_sector.sql", "0029_cotizacion_handover.sql",
      "0030_pricing_reglas_plazos.sql", "0031_cotizacion_autorizacion.sql",
      "0032_cliente_especial_sin_autorizacion.sql", "0033_handover_embarque_al_aceptar.sql",
      "0034_prospecto_solo_borrador.sql", "0035_cotizacion_aceptada_hasta_confirmar_embarque.sql", "0036_cotizacion_handover_tenant_scope.sql",
      "0037_cotizacion_especial_trigger_permissions.sql",
      "0038_coordinador_fijo_por_cliente.sql",
      "0039_cotizacion_margen_moneda_homogenea.sql",
      "0040_coordinador_permission_boundary.sql",
      "0041_prospecto_housekeeping_historicos.sql",
      "0042_periodo_cerrado_campos_derivados.sql",
      "0043_bitacora_no_falsificable.sql",
      "0044_efe_xml_hash_unico_vivo.sql",
      "0045_provision_owner_sin_membresia.sql",
      "0046_cerrar_funciones_internas_abiertas.sql",
      "0047_rls_auth_uid_initplan_backport.sql",
      "0048_limpieza_indices_duplicados.sql",
      "0049_liquidaciones_lectura_finanzas_gerentes.sql",
      "0050_registrar_evento_tracking_embarque.sql",
      "0051_procesamiento_facturapi_webhook.sql",
      "0052_envios_proforma_recuperables.sql",
      "0053_provision_membresia_atomica.sql",
      "0054_conteos_sidebar.sql",
      "0055_embarques_paginacion_filtros.sql",
      "0056_facturacion_bandejas_ligeras.sql",
      "0057_pricing_vinculo_huella_rls_initplan.sql",
      "0058_pricing_faltantes_texto.sql",
      "0059_broker_rol.sql",
      "0060_brokers_fase1.sql",
      "0061_broker_fuente_lead.sql",
      "0062_brokers_fase2.sql",
      "0063_brokers_fase2_lecturas.sql",
      "0064_brokers_fase3_comisiones.sql",
      "0065_brokers_tenant_scope.sql",
      "0066_facturas_filtros_globales.sql",
      "0067_broker_trigger_acl.sql",
      "0068_perfil_fiscal_emisor.sql",
      "0069_isr_resico_contrato.sql",
      "0070_factura_resico_totales_agrupados.sql",
      "0071_isr_resico_cotizacion_embarque.sql",
      "0072_isr_resico_revision_embarque.sql",
      "0073_isr_resico_proforma_normal.sql",
      "0074_isr_resico_consolidacion_proformas.sql",
      "0075_isr_resico_conversion_proforma.sql",
      "0076_isr_resico_factura_manual.sql",
      "0077_isr_resico_intentos_timbrado.sql",
      "0078_isr_resico_recuperar_timbrado.sql",
      "0079_isr_resico_cobranza.sql",
      "0080_isr_resico_timbrado_notas.sql",
      "0081_isr_resico_timbrado_rep.sql",
      "0082_isr_resico_reemplazo.sql",
      "0083_selected_security_internal_helpers_snapshot_writes.sql",
      "0084_brokers_tabulador_comisiones.sql",
      "0085_broker_alta_prospecto_propiedades_empresa.sql",
      "0086_empresa_prospecto_externo.sql",
      "0087_oportunidad_vendedor_externo.sql",
      "0088_oportunidad_vendedor_externo_guard_null.sql",
      "0089_brokers_comision_exclusiva_sin_kam.sql",
      "0090_lectores_membresias_y_libro_respetan_rls.sql",
      "0091_demoras_y_pago_detalle_acceso_protegido.sql",
      "authority-0092-0094.sql",
      "0092_auxiliares_seleccionados_acceso_protegido.sql",
      "0093_actividad_embarque_bitacora_misma_organizacion.sql",
      "0094_autoridad_local_avisos_seleccionados.sql",
      "0095_pricing_sla_horas_habiles.sql",
      "0096_pricing_submodalidad_incoterms_modo.sql",
      "0097_pricing_plazos_por_modo.sql",
      "0098_pricing_lcl_imo_modalidad_negocio.sql",
      "0099_recargos_base_por_unidad_o_embarque.sql",
      "0100_tarifario_aereo_terrestre_base.sql",
      "0101_tarifa_multimodo_moneda.sql",
      "0102_pricing_banderas_aereas.sql",
      "0103_cotizacion_banderas_aereas.sql",
      "0104_costeo_tarifa_tramos_tenant_scope.sql",
      "0105_tarifa_aerea_escalas_reorden.sql",
      "0106_recargo_minimo_proveedor.sql",
      "0107_pricing_solicitud_terrestre.sql",
      "0108_pricing_fase5_operacion.sql",
      "0109_pricing_modos_tenant_scope.sql",
    ]);
    expect(readIsolatedDrizzleReplay().size).toBe(87);
    const archive = paths[1].replace("0022_refacturar_proforma_abre_edicion.sql", "meta/_journal.json");
    expect(JSON.parse(read(archive)).entries[22]).toMatchObject({ idx: 22, when: 1792518064767, tag: "0022_refacturar_proforma_abre_edicion" });
    expect(JSON.parse(read("drizzle/migrations/meta/_journal.json")).entries[22].tag).toBe("0022_cotizacion_comercial");
    const historical = read(paths[1]);
    expect(Buffer.byteLength(historical)).toBe(3307);
    const body = historical.split("AS $function$\n")[1].split("$function$;")[0];
    const cancelar = "  UPDATE public.proformas SET estado_proforma = 'cancelada' WHERE id = p_proforma_id;\n";
    const scopeFiscal = `  IF v_old.evaluacion_fiscal IS NOT NULL AND v_old.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_ORG_AJENA' USING ERRCODE = '42501';
  END IF;
`;
    const ajustado = body.replace("  IF NOT public.has_any_role_efectivo", scopeFiscal + "  IF NOT public.has_any_role_efectivo")
      .replace(cancelar, "").replace("  UPDATE public.conceptos_venta", cancelar + "  UPDATE public.conceptos_venta");
    const actual = read("supabase/schema/baseline.sql").split("CREATE FUNCTION public.refacturar_proforma_rpc(")[1]
      .split("AS $$\n")[1].split("$$;")[0];
    expect(actual).toBe(ajustado);
    expect(historical).not.toContain("public.crear_proforma_atomica(");
  });

  it("reconstructs the new sources in journal order without rewriting immutable SQL", () => {
    const current = HISTORY.slice(4);
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    expect(current.map(item => item.file)).toEqual(journal.entries.slice(26).map(
      (entry: { tag: string }) => `${entry.tag}.sql`,
    ));
    for (const item of current) {
      expect(readFileSync(`scripts/ci/drizzle-history/${item.file}`)).toEqual(
        readFileSync(`drizzle/migrations/${item.file}`),
      );
    }
    // Both preparers execute the verified listing, rather than a disconnected map.
    for (const preparer of ["scripts/ci/rls-prepare-db.sh", "scripts/db/local-verify.sh"]) {
      expect(read(preparer)).toContain('node scripts/ci/drizzle-history/control.mjs list');
      expect(read(preparer)).toContain('done <<< "$isolated_history"');
    }
  });

  it("preserves main 0035 and chains the unapplied tenant correction after it", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")).entries;
    const main = JSON.parse(read("drizzle/migrations/meta/0035_snapshot.json"));
    const tenant = JSON.parse(read("drizzle/migrations/meta/0036_snapshot.json"));
    expect(journal[35]).toEqual({ idx: 35, version: "7", when: 1793990589446,
      tag: "0035_cotizacion_aceptada_hasta_confirmar_embarque", breakpoints: true });
    expect(main.id).toBe("90955556-e21a-46cd-8666-4f951eb6aabb");
    expect(tenant.prevId).toBe(main.id);
    expect(tenant.id).toBe("6f451a18-2f84-43b6-9775-d57c523aae02");
    expect(journal[36].tag).toBe("0036_cotizacion_handover_tenant_scope");
    expect(journal[36].idx).toBe(36);
    expect(journal[36].when).toBeGreaterThan(journal[35].when);
    expect(read("supabase/tests/_guards_manifest.txt").split(/\r?\n/)).toContain(
      "supabase/tests/cotizacion_aceptada_hasta_confirmar.sql",
    );
  });

  it("chains the unapplied special-quote fix after main 0036 with a strict timestamp", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")).entries;
    const tenant = JSON.parse(read("drizzle/migrations/meta/0036_snapshot.json"));
    const special = JSON.parse(read("drizzle/migrations/meta/0037_snapshot.json"));
    expect(special.prevId).toBe(tenant.id);
    expect(special.id).not.toBe(tenant.id);
    expect(journal[37]).toEqual({ idx: 37, version: "7", when: 1793990589448,
      tag: "0037_cotizacion_especial_trigger_permissions", breakpoints: true });
    expect(journal[37].when).toBeGreaterThan(journal[36].when);
  });

  it("preserves the upstream coordinator migration before the unapplied margin fix", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")).entries;
    const special = JSON.parse(read("drizzle/migrations/meta/0037_snapshot.json"));
    const coordinator = JSON.parse(read("drizzle/migrations/meta/0038_snapshot.json"));
    const margin = JSON.parse(read("drizzle/migrations/meta/0039_snapshot.json"));
    expect(coordinator.prevId).toBe(special.id);
    expect(margin.prevId).toBe(coordinator.id);
    expect(margin.id).not.toBe(coordinator.id);
    expect(journal[38]).toEqual({ idx: 38, version: "7", when: 1794002479398,
      tag: "0038_coordinador_fijo_por_cliente", breakpoints: true });
    expect(journal[39]).toEqual({ idx: 39, version: "7", when: 1794002479399,
      tag: "0039_cotizacion_margen_moneda_homogenea", breakpoints: true });
    expect(journal[38].when).toBeGreaterThan(journal[37].when);
    expect(journal[39].when).toBeGreaterThan(journal[38].when);
    expect(read("supabase/tests/_guards_manifest.txt").split(/\r?\n/)).toContain(
      "supabase/tests/cotizacion_margen_mxn_sin_tc.sql",
    );
  });

  it("matches only the reviewed margin helper in the independently regenerated baseline", () => {
    const source = extraerFunciones(read("drizzle/migrations/0039_cotizacion_margen_moneda_homogenea.sql"));
    const baseline = extraerFunciones(read("supabase/schema/baseline.sql").replaceAll(
      "CREATE FUNCTION public.", "CREATE OR REPLACE FUNCTION public.",
    ));
    expect(source.map(definition => definition.firma)).toEqual(["_cotizacion_margen_pct(uuid)"]);
    // pg_dump quotes the exact GUC identifiers; preserve every other attribute/body byte.
    const dumpedSource = source[0].cuerpo.replace(
      "SET search_path TO pg_catalog, public, pg_temp AS",
      "SET search_path TO 'pg_catalog', 'public', 'pg_temp' AS",
    );
    expect(baseline.find(definition => definition.firma === source[0].firma)?.cuerpo).toBe(dumpedSource);
  });

  it.each(HISTORY.slice(4))("pins source and fixture bytes for $file", item => {
    const root = fixture();
    for (const prefix of ["scripts/ci/drizzle-history", "drizzle/migrations"]) {
      const file = join(root, prefix, item.file);
      writeFileSync(file, read(file) + "\n-- drift");
    }
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/hash mismatch/);
  });

  it.each(HISTORY.slice(4))("rejects deployment admission and missing fixture for $file", item => {
    const root = fixture();
    const eligible = join(root, "supabase/migrations", "20990101000000_renamed.sql");
    const isolated = join(root, "scripts/ci/drizzle-history", item.file);
    writeFileSync(eligible, read(isolated));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/deployment-eligible/);
    rmSync(eligible);
    rmSync(isolated);
    expect(() => readIsolatedDrizzleReplay(root)).toThrow();
  });

  it("fails closed if a fixture or its source changes, even together", () => {
    const root = fixture();
    const item = HISTORY[0];
    for (const prefix of ["scripts/ci/drizzle-history", "drizzle/migrations"]) {
      const file = join(root, prefix, item.file);
      writeFileSync(file, read(file) + "\n-- drift");
    }
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/hash mismatch/);
  });

  it("rejects missing recovered history and deployable copies", () => {
    const root = fixture();
    writeFileSync(join(root, "supabase/migrations", HISTORY[0].eligibleName!), read(join(root, "scripts/ci/drizzle-history", HISTORY[0].file)));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/deployment-eligible/);
    rmSync(join(root, "supabase/migrations", HISTORY[0].eligibleName!));
    rmSync(join(root, "scripts/ci/drizzle-history", HISTORY[1].file));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow();
  });

  it("rejects renamed deployment copies, including recovered history", () => {
    const root = fixture();
    writeFileSync(join(root, "supabase/migrations", "20990101000000_renamed.sql"), read(join(root, "scripts/ci/drizzle-history", HISTORY[1].file)));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/deployment-eligible/);
  });

  it("requires explicit isolated scope and rejects extra isolated admissions", () => {
    const root = fixture();
    const path = join(root, "drizzle/replay.json");
    const entries = JSON.parse(read(path));
    const isolatedEntry = entries.find((entry: DrizzleReplayEntry) => entry.file === "0023_margen_minimo_utilidad_rpc.sql");
    expect(isolatedEntry).toBeDefined();
    isolatedEntry.scope = "production";
    writeFileSync(path, JSON.stringify(entries));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/mapping mismatch/);
    isolatedEntry.scope = "isolated-ci";
    entries.push({ file: "unreviewed.sql", scope: "isolated-ci", replays: [] });
    writeFileSync(path, JSON.stringify(entries));
    expect(() => readIsolatedDrizzleReplay(root)).toThrow(/Unreviewed/);
  });

  it("cannot satisfy isolated reconstruction with the canonical map or no verified map", () => {
    const entries = (JSON.parse(read("drizzle/replay.json")) as DrizzleReplayEntry[]).filter(entry => entry.scope === "isolated-ci");
    const isolated = readIsolatedDrizzleReplay();
    expect(scanDrizzleReplay(isolated, new Map(), entries, isolated)).toEqual([]);
    expect(scanDrizzleReplay(isolated, isolated, entries).map(v => v.check)).toContain("DR7");
    const changed = new Map(isolated);
    changed.set(HISTORY[0].file, changed.get(HISTORY[0].file)! + "\n");
    expect(scanDrizzleReplay(isolated, new Map(), entries, changed).map(v => v.check)).toContain("DR7");
  });
});
