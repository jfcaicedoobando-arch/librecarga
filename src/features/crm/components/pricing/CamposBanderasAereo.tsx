/**
 * Banderas de la carga aérea: baterías de litio y expedidor conocido.
 * Son informativas para Pricing; no bloquean el envío.
 */
import { CampoSiNo } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";

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
    </>
  );
}
