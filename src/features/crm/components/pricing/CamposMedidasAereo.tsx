/**
 * Medidas de carga aérea: una o varias líneas de bultos L×A×H (cm) para carga
 * mixta. Suma volumen (CBM) y muestra el peso tasable (mayor entre peso real y
 * 167 kg/m³). Guarda en cantidad, dimensiones y volumen_cbm, sin columnas nuevas.
 */
import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import { aNumero } from "@/features/crm/services/pricing/tiposPricing";
import {
  leerDimensionesLineas, pesoTasableSolicitud, textoDimensionesLineas, totalBultos, volumenLineasM3, type MedidasBultos,
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
const VACIA: MedidasBultos = { bultos: null, largo: null, ancho: null, alto: null };

export function CamposMedidasAereo({ datos, set, disabled }: Props) {
  const [ls, setLs] = useState<MedidasBultos[]>(() => {
    const l = leerDimensionesLineas(datos.dimensiones);
    return l.length === 1 && l[0].bultos == null ? [{ ...VACIA, bultos: datos.cantidad ?? null }] : l;
  });
  const dimensionesDerivadas = useRef(textoDimensionesLineas(ls) !== null);
  const volumenManual = useRef(datos.volumen_cbm != null && datos.volumen_cbm !== volumenLineasM3(ls));
  const aplicar = (nl: MedidasBultos[]) => {
    setLs(nl);
    set("cantidad", totalBultos(nl));
    const vol = volumenLineasM3(nl);
    const dimensiones = textoDimensionesLineas(nl);
    if (dimensiones !== null || dimensionesDerivadas.current) set("dimensiones", dimensiones);
    dimensionesDerivadas.current = dimensiones !== null;
    if (!volumenManual.current) set("volumen_cbm", vol);
  };
  const cambiar = (i: number, k: keyof MedidasBultos, v: string) => {
    const n = aNumero(v);
    const val = n != null && n > 0 ? (k === "bultos" ? Math.trunc(n) : n) : null;
    aplicar(ls.map((l, j) => (j === i ? { ...l, [k]: val } : l)));
  };
  const tasable = pesoTasableSolicitud(datos.peso, datos.unidad_medida, datos.volumen_cbm);
  return (
    <>
      {ls.map((l, i) => (
        <div key={i} className="col-span-full grid grid-cols-2 items-end gap-2 md:grid-cols-5">
          {CAMPOS.map((c) => (
            <CampoTexto key={c.k} id={i === 0 ? `pr-aereo-${c.k}` : `pr-aereo-${c.k}-${i}`} label={c.label} type="number"
              disabled={disabled} value={l[c.k]} onChange={(v) => cambiar(i, c.k, v)} />
          ))}
          {ls.length > 1 && !disabled && (
            <Button type="button" variant="ghost" size="sm" aria-label={`Quitar línea ${i + 1}`}
              onClick={() => aplicar(ls.filter((_, j) => j !== i))}><X className="size-4" /></Button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="col-span-full">
          <Button type="button" variant="outline" size="sm" onClick={() => aplicar([...ls, VACIA])}>
            <Plus className="mr-1 size-4" /> Agregar bultos de otra medida
          </Button>
        </div>
      )}
      <CampoTexto id="pr-aereo-cbm" label="Volumen total (CBM)" type="number" disabled={disabled} value={datos.volumen_cbm}
        onChange={(v) => {
          const n = aNumero(v);
          const manual = n != null && n > 0 ? n : null;
          volumenManual.current = manual !== null;
          set("volumen_cbm", manual);
        }} />
      <p className="self-end pb-2 text-body-sm text-muted-foreground">
        Peso tasable: {tasable == null ? "captura peso (kg, lb o t) y medidas" : `${formatNumber(tasable, { maximumFractionDigits: 2 })} kg`}
      </p>
    </>
  );
}
