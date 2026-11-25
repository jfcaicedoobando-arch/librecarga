/**
 * Barrel público del feature Costeo.
 * Sólo expone lo que otros features pueden consumir sin imports profundos.
 * Etapa 2: utilidad única de presentación de identidad de puertos.
 */
export {
  contextoPuerto,
  contextoRuta,
  destinoDe,
  etiquetaPuertoCompleta,
  etiquetaRutaCompleta,
  etiquetaRutaTexto,
  identidadDesdeTexto,
  nombrePuerto,
  origenDe,
  rutaCorta,
  textoBusquedaPuertos,
} from "./utils/puertoLabel";
export type { FilaConPuertos, PuertoIdentidad } from "./utils/puertoLabel";
export { esTarifaUsableEn, resolverEstadoVigenciaTarifa } from "./utils/vigenciaTarifa";
export type { EstadoCanonicoTarifa, TarifaVigenciaLike } from "./utils/vigenciaTarifa";
export { TarifaForm } from "./components/TarifaForm";
export { CartaGarantiaBadge } from "./components/CartaGarantiaBadge";
export { NuevaTarifaMultimodoDialog } from "./tarifario/multimodo/NuevaTarifaMultimodoDialog";
export { TIPOS_UNIDAD } from "./domain/tarifaMultimodo";

export * from "./services/tarifarioService";
export * from "./services/cargosService";
export * from "./tarifario/coincidencias";
export { costeo as costeoQueryKeys } from "./queryKeys";
