import { huellaDefinicion, indexarMigraciones } from "./replayMirror";
import { normalizeSql } from "./replayMirrorSql";

type Index = ReturnType<typeof indexarMigraciones>;
const FASE5 = "0108_pricing_fase5_operacion.sql";
const REGLAS_PLAZOS = "0030_pricing_reglas_plazos.sql";

const preimagenes = new Map([
  ["crm_responder_solicitud_pricing(uuid)", "3047a2f57ef0ff58321e520496906152cfeb051e3854c0506badda64aef63120"],
  ["crm_cancelar_solicitud_pricing(uuid)", "dab66ed1063463407d3b35a554321df9f497d6ea3ef1783cce1adbaeff9e366c"],
  ["_crm_pricing_opcion_guard()", "bbab8a084a8a8cd98e21edd459bec22ac6d664e7d9f45bf887a4c51da4141bac"],
  ["_costeo_tarifa_solicitud_guard()", "8e7b4c04c13a3ba04db5a0fae892a3a713117112b2fb0d7438ef49fe1ddd1e68"],
  ["crm_aplicar_tarifa_tarifario(uuid,uuid)", "84f9a448825d792da2ae0960479645c53b56874ba747be483b708292edd636f5"],
  ["crm_pricing_cambiar_complejidad(uuid,text,text)", "ef9e64bc846be95d8e0eb68acc2addb78a877ca901243888d2dd3626ceace07e"],
  ["crm_pricing_ampliar_plazo(uuid,int,text)", "dcc0d1a2090ce561567aaf09a230f80892e89e46f209fb6eacc492e9e346eea0"],
  ["crm_enviar_solicitud_pricing(uuid)", "a67f64f57147e4b97634fe3ba02b5a728d94e15e57eb2adf15088b4928f63045"],
]);

const guardsDe0030 = new Set(["_crm_pricing_opcion_guard()", "_costeo_tarifa_solicitud_guard()"]);

/** Modela los reemplazos exactos de 0108 después de verificar las fuentes aisladas. */
export function aplicarReplayMirrorPricingFase5(index: Index, history: ReadonlyMap<string, string>): Index {
  const sql = history.get(FASE5);
  const reglas = history.get(REGLAS_PLAZOS);
  if (!sql || !reglas) throw new Error("Pricing Fase 5: faltan las fuentes revisadas de replay");
  const reemplazos = [...sql.matchAll(
    /\('public\.([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\)/g,
  )];
  if (reemplazos.length !== preimagenes.size) throw new Error("Pricing Fase 5: lista de reemplazos inesperada");

  const guards = indexarMigraciones(new Map([[REGLAS_PLAZOS, reglas]]));
  const result = new Map(index);
  const procesadas = new Set<string>();
  for (const [, original, anterior, nuevo] of reemplazos) {
    const firma = original.replace(/\binteger\b/g, "int");
    const previous = guardsDe0030.has(firma) ? guards.get(firma) : index.get(firma);
    if (!previous || procesadas.has(firma) || preimagenes.get(firma) !== huellaDefinicion(previous.definicion)) {
      throw new Error(`Pricing Fase 5: preimagen inesperada para ${firma}`);
    }

    const partes: string[] = JSON.parse(previous.definicion.cuerpo);
    const fragmento = normalizeSql(anterior);
    if (partes.length !== 3 || !fragmento || partes[1].split(fragmento).length !== 2) {
      throw new Error(`Pricing Fase 5: reemplazo ambiguo para ${firma}`);
    }
    partes[1] = partes[1].replace(fragmento, () => normalizeSql(nuevo));
    result.set(firma, { migracion: FASE5, definicion: { ...previous.definicion, cuerpo: JSON.stringify(partes) } });
    procesadas.add(firma);
  }
  return result;
}

/** Aplica los dos cambios exactos del bloque de políticas de la migración 0116. */
export function aplicarRepinVinculoPricing(index: Index): void {
  const firma = "crm_vincular_cotizacion_cliente_pricing(uuid,uuid,uuid,uuid)";
  const previous = index.get(firma);
  if (!previous || huellaDefinicion(previous.definicion) !== "21cbc81809c755449f70f0a8a0cdf6776011cb092c90b850f3c1f94d096eebc3") {
    throw new Error("Pricing 0116: preimagen inesperada");
  }
  const partes: string[] = JSON.parse(previous.definicion.cuerpo);
  const politicas = partes[1].split("$policies$");
  const reemplazos = [
    ["has_role(auth.uid(), 'cliente'::app_role) AND (cliente_id IN",
      "has_role(( SELECT auth.uid() AS uid), 'cliente'::app_role) AND (cliente_id IN"],
    ["(created_by = auth.uid()))", "(created_by = ( SELECT auth.uid() AS uid)))"],
  ];
  for (const [antes, despues] of reemplazos) {
    if (politicas.length !== 3 || politicas[1].split(antes).length !== 2) throw new Error("Pricing 0116: reemplazo ambiguo");
    politicas[1] = politicas[1].replace(antes, despues);
  }
  partes[1] = politicas.join("$policies$");
  index.set(firma, { migracion: "drizzle/migrations/0116_pricing_vinculo_repin_politicas.sql",
    definicion: { ...previous.definicion, cuerpo: JSON.stringify(partes) } });
}
