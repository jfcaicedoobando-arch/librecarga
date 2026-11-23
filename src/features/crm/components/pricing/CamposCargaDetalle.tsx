/**
 * Campos condicionales de carga: volumen y W/M en LCL; clase IMO y número UN si es peligrosa.
 * La base exige estos datos al enviar (`crm_enviar_solicitud_pricing`).
 */
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/formatters";
import { aNumero } from "@/features/crm/services/pricing/tiposPricing";
import { CLASES_IMO, faltantesCargaDetalle, normalizarNumeroUN, pesoMedidaWM } from "@/features/crm/services/pricing/modoPricing";
import { CampoLista, CampoTexto } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  disabled?: boolean;
}

export function CamposCargaDetalle({ datos, set, disabled }: Props) {
  const [un, setUn] = useState(datos.imo_un ?? "");
  useEffect(() => {
    if (datos.imo_un && normalizarNumeroUN(un) !== datos.imo_un) setUn(datos.imo_un);
  }, [datos.imo_un]); // eslint-disable-line react-hooks/exhaustive-deps -- sólo sincroniza valores guardados
  const faltan = faltantesCargaDetalle(datos);
  const wm = pesoMedidaWM(datos.peso, datos.unidad_medida, datos.volumen_cbm);
  return (
    <>
      {faltan.length > 0 && (
        <p role="alert" className="col-span-full rounded-md border border-destructive/40 bg-destructive/10 p-3 text-body-sm text-destructive">
          {datos.submodalidad === "LCL" && datos.imo === true ? "Carga suelta peligrosa" : datos.imo === true ? "Mercancía peligrosa" : "Carga suelta (LCL)"}:
          {" "}falta {faltan.join(", ")}. Pricing no aceptará el envío sin estos datos.
        </p>
      )}
      {datos.submodalidad === "LCL" && (
        <>
          <CampoTexto id="pr-cbm" label="Volumen (CBM)" type="number" required disabled={disabled}
            value={datos.volumen_cbm}
            onChange={(v) => { const n = aNumero(v); set("volumen_cbm", n != null && n > 0 ? n : null); }} />
          <p className="self-end pb-2 text-body-sm text-muted-foreground">
            Peso/medida (W/M): {wm == null ? "captura peso en kg, lb o t y CBM" : formatNumber(wm, { maximumFractionDigits: 3 })}
          </p>
        </>
      )}
      {datos.imo === true && (
        <>
          <CampoLista id="pr-imo-clase" label="Clase IMO" required disabled={disabled} value={datos.imo_clase ?? null}
            opciones={CLASES_IMO} onChange={(v) => set("imo_clase", v)} />
          <CampoTexto id="pr-imo-un" label="Número UN (4 dígitos)" required disabled={disabled} value={un}
            onChange={(v) => { setUn(v); set("imo_un", normalizarNumeroUN(v)); }} />
        </>
      )}
    </>
  );
}
