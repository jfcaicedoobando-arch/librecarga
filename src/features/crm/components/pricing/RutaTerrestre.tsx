/** Ruta terrestre: país, ciudad (se guarda en pol/pod) y CP opcional por extremo, más paradas. */
import { useState } from "react";
import { CampoLista, CampoTexto } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";
import { cpValido, paradasDeTexto } from "@/features/crm/services/pricing/terrestrePricing";

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  paises: ReadonlyArray<string | { value: string; label: string }>;
  disabled?: boolean;
}

export function RutaTerrestre({ datos, set, paises, disabled }: Props) {
  const d = { disabled };
  const [cpO, setCpO] = useState(datos.origen_cp ?? "");
  const [cpD, setCpD] = useState(datos.destino_cp ?? "");
  const [paradas, setParadas] = useState((datos.paradas ?? []).join(", "));
  const cpInvalido = (t: string) => t.trim() !== "" && cpValido(t) == null;
  return (
    <>
      <fieldset className="col-span-full grid min-w-0 gap-3 rounded-md border p-3 sm:grid-cols-3">
        <legend className="px-1 text-body-sm font-medium">Origen</legend>
        <CampoLista id="pr-t-origen" label="País de origen" {...d} value={datos.origen ?? null}
          opciones={paises} onChange={(v) => set("origen", v)} />
        <CampoTexto id="pr-t-pol" label="Ciudad de origen" required {...d} value={datos.pol}
          onChange={(v) => set("pol", v || null)} />
        <CampoTexto id="pr-t-cp-o" label="CP de origen (5 dígitos)" {...d} value={cpO}
          onChange={(v) => { setCpO(v); set("origen_cp", cpValido(v)); }} />
      </fieldset>
      <fieldset className="col-span-full grid min-w-0 gap-3 rounded-md border p-3 sm:grid-cols-3">
        <legend className="px-1 text-body-sm font-medium">Destino</legend>
        <CampoLista id="pr-t-destino" label="País de destino" {...d} value={datos.destino ?? null}
          opciones={paises} onChange={(v) => set("destino", v)} />
        <CampoTexto id="pr-t-pod" label="Ciudad de destino" required {...d} value={datos.pod}
          onChange={(v) => set("pod", v || null)} />
        <CampoTexto id="pr-t-cp-d" label="CP de destino (5 dígitos)" {...d} value={cpD}
          onChange={(v) => { setCpD(v); set("destino_cp", cpValido(v)); }} />
      </fieldset>
      {(cpInvalido(cpO) || cpInvalido(cpD)) && (
        <p role="alert" className="col-span-full text-body-sm text-destructive">El código postal debe tener 5 dígitos; si no, no se guarda.</p>
      )}
      <CampoTexto id="pr-t-paradas" label="Paradas intermedias (separadas por coma, máx. 5)" {...d} value={paradas}
        onChange={(v) => { setParadas(v); set("paradas", paradasDeTexto(v)); }} />
    </>
  );
}
