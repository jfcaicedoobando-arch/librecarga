/**
 * Banderas críticas del modo aéreo: baterías de litio, expedidor conocido y tipo de avión.
 * Son informativas para Pricing; no bloquean el envío.
 */
import { CampoLista, CampoSiNo } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";

export const TIPOS_AERONAVE = [
  { value: "PAX", label: "PAX — avión de pasajeros" },
  { value: "CAO", label: "CAO — sólo carguero" },
];

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  disabled?: boolean;
}

export function CamposBanderasAereo({ datos, set, disabled }: Props) {
  return (
    <>
      <CampoSiNo id="pr-litio" label="¿Lleva baterías de litio?" disabled={disabled}
        value={datos.baterias_litio} onChange={(v) => set("baterias_litio", v)} />
      <CampoSiNo id="pr-known-shipper" label="¿Expedidor conocido (Known Shipper)?" disabled={disabled}
        value={datos.known_shipper} onChange={(v) => set("known_shipper", v)} />
      <CampoLista id="pr-aeronave" label="Tipo de avión" disabled={disabled}
        value={datos.tipo_aeronave ?? null} opciones={TIPOS_AERONAVE} onChange={(v) => set("tipo_aeronave", v)} />
    </>
  );
}
