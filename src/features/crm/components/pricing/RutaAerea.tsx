/** Ruta aérea: aeropuertos de origen y destino (IATA); el país se toma del aeropuerto. */
import { useId } from "react";
import { CampoAeropuerto } from "./CampoAeropuerto";
import type { DatosSolicitud } from "./SolicitudPricingCampos";

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  disabled?: boolean;
}

export function RutaAerea({ datos, set, disabled }: Props) {
  const errorRutaId = useId();
  const repetido = Boolean(datos.pol && datos.pol === datos.pod);
  return (
    <>
      <CampoAeropuerto id="pr-aol" label="Aeropuerto de origen" value={datos.pol} disabled={disabled}
        onChange={(et, a) => { set("pol", et); set("origen", a?.pais ?? null); }} />
      <CampoAeropuerto id="pr-aod" label="Aeropuerto de destino" value={datos.pod} disabled={disabled}
        descripcionId={repetido ? errorRutaId : undefined} invalido={repetido || undefined}
        onChange={(et, a) => { set("pod", et); set("destino", a?.pais ?? null); }} />
      {repetido && (
        <p id={errorRutaId} role="alert" className="col-span-full text-body-sm text-destructive">Origen y destino no pueden ser el mismo aeropuerto.</p>
      )}
    </>
  );
}
