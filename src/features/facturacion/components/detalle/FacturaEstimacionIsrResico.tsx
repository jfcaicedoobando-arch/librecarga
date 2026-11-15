import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { evaluarIsrResico, type DatosEstimacionIsr } from "../../services/evaluarIsrResico";
import type { Moneda } from "../../types";

const MOTIVOS: Record<string, string> = {
  conexion_pendiente: "Configura Facturapi en Configuración → Facturación.",
  ambiente_discordante: "Cambió el ambiente de Facturapi. Vuelve a calcular.",
  perfil_no_confirmado: "Confirma el perfil del emisor en Configuración → Facturación.",
  vigencia_perfil_pendiente: "Revisa la fecha de vigencia del perfil del emisor.",
  receptor_no_identificado: "Completa los datos fiscales del cliente.",
  receptor_generico_o_extranjero: "Pide a Contabilidad que revise el RFC del receptor.",
  conflicto_no_objeto: "Pide a Contabilidad que revise el tratamiento No objeto de este concepto.",
  clasificacion_pendiente: "Completa el tratamiento fiscal del concepto.",
};

export function FacturaEstimacionIsrResico({ datos, moneda }: {
  datos: DatosEstimacionIsr;
  moneda: Moneda;
}) {
  const estimacion = useMutation({ mutationFn: evaluarIsrResico });
  const resultado = estimacion.isSuccess ? estimacion.data : null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
      <Button type="button" size="sm" variant="outline" disabled={estimacion.isPending}
        onClick={() => estimacion.mutate(datos)}>
        {estimacion.isPending ? "Calculando…" : "Estimar ISR RESICO"}
      </Button>
      <div role="status" className="text-body-sm">
        {resultado?.estado === "aplica" && resultado.monto_ret_isr !== null &&
          <span>Retención estimada · 1.25% · {formatCurrency(resultado.monto_ret_isr, moneda)}</span>}
        {resultado?.estado === "no_aplica" && <span>No aplica ISR RESICO.</span>}
        {resultado?.estado === "pendiente" &&
          <span>{MOTIVOS[resultado.motivo] ?? "Pide a Contabilidad que revise los datos fiscales."}</span>}
        {estimacion.isError && <span>No se pudo estimar la retención. Intenta de nuevo.</span>}
      </div>
    </div>
  );
}
