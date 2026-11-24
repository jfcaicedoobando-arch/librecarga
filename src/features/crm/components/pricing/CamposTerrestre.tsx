/** Datos de carga terrestre: cruce/in-bond, unidad (FTL), tarimas (LTL) y arrastre. */
import { CampoLista, CampoSiNo, CampoTexto } from "./CamposPricing";
import type { DatosSolicitud } from "./SolicitudPricingCampos";
import { TIPOS_UNIDAD } from "@/features/costeo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { aNumero } from "@/features/crm/services/pricing/tiposPricing";
import { faltantesTerrestre } from "@/features/crm/services/pricing/terrestrePricing";

interface Props {
  datos: DatosSolicitud;
  set: <K extends keyof DatosSolicitud>(campo: K, valor: DatosSolicitud[K]) => void;
  disabled?: boolean;
}

export function CamposTerrestre({ datos, set, disabled }: Props) {
  const d = { disabled };
  const faltan = faltantesTerrestre(datos);
  return (
    <>
      {faltan.length > 0 && (
        <Alert variant="destructive" className="col-span-full p-3">
          <AlertDescription className="text-body-sm">
            Terrestre {datos.submodalidad}: falta {faltan.join(", ")}. Pricing no aceptará el envío sin estos datos.
          </AlertDescription>
        </Alert>
      )}
      <CampoSiNo id="pr-t-cruce" label="¿Cruce fronterizo?" {...d} value={datos.cruce_fronterizo ?? null}
        onChange={(v) => { set("cruce_fronterizo", v); if (v !== true) set("in_bond", null); }} />
      {datos.cruce_fronterizo === true && (
        <CampoSiNo id="pr-t-inbond" label="¿In-bond?" {...d} value={datos.in_bond ?? null} onChange={(v) => set("in_bond", v)} />
      )}
      {datos.submodalidad === "FTL" && (
        <CampoLista id="pr-t-unidad" label="Tipo de unidad" required {...d} value={datos.tipo_unidad ?? null}
          opciones={TIPOS_UNIDAD} onChange={(v) => set("tipo_unidad", v)} />
      )}
      {datos.submodalidad === "LTL" && (
        <CampoTexto id="pr-t-tarimas" label="Tarimas" type="number" required {...d} value={datos.tarimas ?? null}
          onChange={(v) => { const n = aNumero(v); set("tarimas", n != null && n >= 1 && n <= 60 ? Math.trunc(n) : null); }} />
      )}
      {datos.submodalidad === "Arrastre" && (
        <>
          <CampoTexto id="pr-t-puerto" label="Puerto de recolección/entrega" {...d} value={datos.arrastre_puerto ?? null}
            onChange={(v) => set("arrastre_puerto", v || null)} />
          <CampoSiNo id="pr-t-vacio" label="¿Retorno de vacío?" {...d} value={datos.retorno_vacio ?? null} onChange={(v) => set("retorno_vacio", v)} />
          <CampoSiNo id="pr-t-sobrepeso" label="¿Sobrepeso?" {...d} value={datos.sobrepeso ?? null} onChange={(v) => set("sobrepeso", v)} />
        </>
      )}
    </>
  );
}
