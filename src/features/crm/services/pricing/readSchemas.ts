import { z } from "zod";

const puertoDbSchema = z.object({ name: z.string() }).passthrough().nullable();

/** Columnas y joins que consume la respuesta de pricing del catálogo. */
export const tarifasRespuestaDbSchema = z.array(
  z.object({
    id: z.string().min(1),
    flete_base: z.number().finite(),
    moneda: z.string(),
    unidad_flete: z.string().nullable(),
    carta_garantia: z.boolean().nullable(),
    transit_time_dias: z.number().finite().nullable(),
    vigente_hasta: z.string().nullable(),
    notas: z.string().nullable(),
    aerolinea: z.string().nullable().optional(),
    escalas: z.array(z.string()).nullable().optional(),
    agente: z.object({ nombre: z.string() }).passthrough().nullable(),
    naviera: z.object({ name: z.string() }).passthrough().nullable(),
    tipo: z.object({ code: z.string() }).passthrough().nullable(),
    ruta: z.object({
      origen: puertoDbSchema,
      destino: puertoDbSchema,
    }).passthrough().nullable(),
    recargos: z.array(z.object({
      id: z.string(), concepto: z.string(), lado: z.string(), monto: z.number().finite(),
      moneda: z.string(), base: z.string(),
    }).passthrough()).optional(),
  }).passthrough(),
);
