/**
 * Medidas de carga aérea: bultos y L×A×H (cm). Calcula volumen (CBM) y muestra
 * el peso tasable (mayor entre peso real y 167 kg/m³). Guarda en cantidad,
 * dimensiones y volumen_cbm, sin columnas nuevas.
 */
import { useState } from "react";
import { formatNumber } from "@/lib/formatters";
import { aNumero } from "@/features/crm/services/pricing/tiposPricing";
import {
  leerDimensiones, pesoTasableSolicitud, textoDimensiones, volumenBultosM3, type MedidasBultos,
} from "@/features/crm/services/pricing/medidasAereo";
import { CampoTexto } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  disabled?: boolean;
}

const CAMPOS: { k: keyof MedidasBultos; label: string }[] = [
  { k: "bultos", label: "Bultos" }, { k: "largo", label: "Largo (cm)" },
  { k: "ancho", label: "Ancho (cm)" }, { k: "alto", label: "Alto (cm)" },
];

export function CamposMedidasAereo({ datos, set, disabled }: Props) {
  const [m, setM] = useState<MedidasBultos>(() => {
    const l = leerDimensiones(datos.dimensiones);
    return { ...l, bultos: l.bultos ?? datos.cantidad ?? null };
  });
  const cambiar = (k: keyof MedidasBultos, v: string) => {
    const n = aNumero(v);
    const nm = { ...m, [k]: n != null && n > 0 ? (k === "bultos" ? Math.trunc(n) : n) : null };
    setM(nm);
    if (k === "bultos") set("cantidad", nm.bultos);
    const vol = volumenBultosM3(nm);
    if (vol != null) { set("volumen_cbm", vol); set("dimensiones", textoDimensiones(nm)); }
  };
  const tasable = pesoTasableSolicitud(datos.peso, datos.unidad_medida, datos.volumen_cbm);
  return (
    <>
      {CAMPOS.map((c) => (
        <CampoTexto key={c.k} id={`pr-aereo-${c.k}`} label={c.label} type="number" disabled={disabled}
          value={m[c.k]} onChange={(v) => cambiar(c.k, v)} />
      ))}
      <CampoTexto id="pr-aereo-cbm" label="Volumen (CBM)" type="number" disabled={disabled} value={datos.volumen_cbm}
        onChange={(v) => { const n = aNumero(v); set("volumen_cbm", n != null && n > 0 ? n : null); }} />
      <p className="self-end pb-2 text-body-sm text-muted-foreground">
        Peso tasable: {tasable == null ? "captura peso (kg, lb o t) y medidas" : `${formatNumber(tasable, { maximumFractionDigits: 2 })} kg`}
      </p>
    </>
  );
}
