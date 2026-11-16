import type { AppRole } from "@/types/appRole";
import type { CotizacionRow } from "../types";
import { esAutorizadorCotizacion } from "./autorizacionCotizacion";
import { leerSnapshotFiscalCotizacion } from "./snapshotFiscalCotizacion";

export function fiscalDetalleCotizacion(cotizacion: CotizacionRow, rol: AppRole | null, puedeEscribir: boolean, tieneEmbarqueVivo: boolean) {
  const lectura = leerSnapshotFiscalCotizacion(cotizacion.evaluacion_fiscal);
  const fiscal = "bloques" in lectura && (lectura.organization_id !== cotizacion.organization_id || lectura.cliente_id !== cotizacion.cliente_id)
    ? { estado: "invalido" } as const : lectura;
  return {
    fiscal,
    fiscalPendiente: fiscal.estado !== "legacy" && fiscal.estado !== "confirmado",
    permiteRevision: puedeEscribir && rol !== "super_admin" && esAutorizadorCotizacion(rol)
      && ["Enviada", "Aceptada", "Vencida", "Archivada"].includes(cotizacion.estado)
      && !cotizacion.embarque_id && !tieneEmbarqueVivo,
  };
}
