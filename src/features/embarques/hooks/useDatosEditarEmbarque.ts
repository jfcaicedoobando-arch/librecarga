import {
  useEmbarque, useEmbarqueConceptosVenta, useEmbarqueConceptosCosto,
  useProveedoresForSelect,
} from "./useEmbarques";
import { useContenedoresEmbarque } from "./useContenedoresEmbarque";
import { useClientesForSelect } from "@/features/cliente/hooks/useClientes";

/** Una lectura fallida nunca representa una colección vacía al editar. */
export function useDatosEditarEmbarque(id: string | undefined) {
  const embarque = useEmbarque(id);
  const ventas = useEmbarqueConceptosVenta(id);
  const costos = useEmbarqueConceptosCosto(id);
  const contenedores = useContenedoresEmbarque(id);
  const clientes = useClientesForSelect();
  const proveedores = useProveedoresForSelect();
  const consultas = [
    { nombre: "el embarque", query: embarque },
    { nombre: "las ventas del embarque", query: ventas },
    { nombre: "los costos del embarque", query: costos },
    { nombre: "los contenedores del embarque", query: contenedores },
    { nombre: "el catálogo de clientes", query: clientes },
    { nombre: "el catálogo de proveedores", query: proveedores },
  ];
  const fallida = consultas.find(({ query }) => query.isError);
  const listo = consultas.every(({ query }) => query.data !== undefined && !query.isError);

  return {
    embarque: embarque.data,
    conceptosVentaDb: ventas.data ?? [],
    conceptosCostoDb: costos.data ?? [],
    contenedoresDb: contenedores.data ?? [],
    clientes: clientes.data ?? [],
    proveedoresDb: proveedores.data ?? [],
    listo,
    isError: Boolean(fallida),
    // Si el expediente no existe, permitir que la ruta muestre "no encontrado".
    isLoading: !fallida && !listo && embarque.data !== null,
    errorCarga: fallida
      ? `No pudimos cargar ${fallida.nombre}. Reintenta antes de guardar.`
      : undefined,
    refetch: () => Promise.all(consultas
      .filter(({ query }) => query.isError || query.data === undefined)
      .map(({ query }) => query.refetch())),
  };
}
