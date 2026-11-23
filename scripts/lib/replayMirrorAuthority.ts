import { huellaDefinicion, type indexarMigraciones } from "./replayMirror";
import { normalizeSql } from "./replayMirrorSql";

type Index = ReturnType<typeof indexarMigraciones>;
const DEMORAS = "0092_auxiliares_seleccionados_acceso_protegido.sql";
const AVISOS = "0094_autoridad_local_avisos_seleccionados.sql";

// The isolated history reader pins the SQL files. These pins also require
// the original declaration and body before modeling any change to a mirror.
const patches = [
  {
    firma: "calcular_costo_demoras(uuid,uuid,int)",
    huella: "4aa98af500e23bf99781bff2f32a99ae968765e9d18d271e41c5f44b57440764",
    migracion: DEMORAS,
  },
  {
    firma: "crm_vincular_cotizacion(uuid,jsonb,uuid,uuid)",
    huella: "7fd4f7f801d1c52906107fdd7c31af83a45601c0d5b3e1b62f2a1c1e2d117faf",
    migracion: AVISOS,
  },
  {
    firma: "crear_proforma_atomica(uuid,uuid,uuid,text,text,text,uuid[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,int,numeric,jsonb)",
    huella: "b7492512e7932dd0f826f40135656df81ef9a87104c682d6624fd5a0112a5744",
    migracion: AVISOS,
  },
] as const;

function reemplazarUnaVez(texto: string, anterior: string, nuevo: string, firma: string): string {
  if (!anterior || texto.split(anterior).length !== 2) {
    throw new Error(`Replay de permisos: el reemplazo debe ser único en ${firma}`);
  }
  return texto.replace(anterior, () => nuevo);
}

function bloquesDeAvisos(sql: string) {
  return new Map([...sql.matchAll(
    /pg_get_functiondef\('public\.([^']+)'::regprocedure\);[^]*?replace\(v_def,\$old\$([^]*?)\$old\$,\$new\$([^]*?)\$new\$\);/g,
  )].map(([, firma, anterior, nuevo]) => [firma, { anterior, nuevo }]));
}

/** Model only the reviewed operations on canonical mirrors; PostgreSQL checks the real replay. */
export function aplicarReplayMirrorAuthority(index: Index, history: ReadonlyMap<string, string>): Index {
  const demoras = history.get(DEMORAS);
  const avisos = history.get(AVISOS);
  if (!demoras?.includes("ALTER FUNCTION public.calcular_costo_demoras(uuid,uuid,integer) SECURITY INVOKER;") || !avisos) {
    throw new Error("Replay de permisos: falta la fuente revisada");
  }
  const bloques = bloquesDeAvisos(avisos);
  const result = new Map(index);
  for (const { firma, huella, migracion } of patches) {
    const previous = index.get(firma);
    if (!previous || huellaDefinicion(previous.definicion) !== huella) {
      throw new Error(`Replay de permisos: cambió la preimagen de ${firma}`);
    }
    const parts: string[] = JSON.parse(previous.definicion.cuerpo);
    if (migracion === DEMORAS) {
      parts[0] = reemplazarUnaVez(parts[0], "SECURITY DEFINER", "SECURITY INVOKER", firma);
    } else {
      const bloque = bloques.get(firma.replace(/\bint\b/g, "integer"));
      if (!bloque) throw new Error(`Replay de permisos: falta el bloque de ${firma}`);
      parts[1] = reemplazarUnaVez(parts[1], normalizeSql(bloque.anterior), normalizeSql(bloque.nuevo), firma);
    }
    result.set(firma, { migracion, definicion: { ...previous.definicion, cuerpo: JSON.stringify(parts) } });
  }
  return result;
}
