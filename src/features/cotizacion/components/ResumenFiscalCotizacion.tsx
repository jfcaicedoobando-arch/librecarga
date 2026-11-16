import { formatCurrency } from "@/lib/formatters";

interface BloqueFiscal {
  moneda: "USD" | "MXN";
  subtotal: number;
  iva: number;
  ret_isr: number;
  ret_iva: number;
  total: number;
}

type ResumenFiscalProps =
  | { estado: "confirmado" | "pendiente"; bloques: readonly BloqueFiscal[]; motivos: readonly string[] }
  | { estado: "cargando" | "revision" | "invalido" | "error" };

const motivosPendientes: Record<string, string> = {
  ambiente_discordante: "Revisa el ambiente de Facturapi.",
  clasificacion_pendiente: "Completa el tratamiento fiscal de los conceptos.",
  conflicto_no_objeto: "Pide a Contabilidad que revise los conceptos clasificados como No objeto.",
  conexion_pendiente: "Configura Facturapi en la organización.",
  perfil_no_confirmado: "Confirma el perfil fiscal del emisor.",
  receptor_generico_o_extranjero: "Pide a Contabilidad que revise el RFC del receptor.",
  receptor_no_identificado: "Completa los datos fiscales del cliente.",
  vigencia_perfil_pendiente: "Revisa la fecha de vigencia del perfil fiscal.",
};

export function ResumenFiscalCotizacion(props: ResumenFiscalProps) {
  if (props.estado !== "confirmado" && props.estado !== "pendiente") {
    const mensaje = props.estado === "cargando" ? "Calculando los totales fiscales…"
      : props.estado === "error" ? "No se pudieron calcular los totales fiscales."
        : "Revisa la evaluación fiscal antes de usar estos importes.";
    return <p role="status" className="rounded-md border bg-muted/30 p-3 text-body-sm">{mensaje}</p>;
  }

  const provisional = props.estado === "pendiente";
  const indicaciones = [...new Set(props.motivos.map(
    (motivo) => motivosPendientes[motivo] ?? "Pide a Contabilidad que revise la evaluación fiscal.",
  ))];

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4" aria-label="Desglose fiscal">
      {provisional && (
        <div role="status" className="space-y-1 text-body-sm">
          <p className="font-semibold">Evaluación fiscal pendiente</p>
          {indicaciones.map((texto) => <p key={texto}>{texto}</p>)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {props.bloques.map((bloque) => (
          <dl key={bloque.moneda} aria-label={bloque.moneda} className="space-y-1 text-body tabular-nums">
            <Importe label={`Subtotal ${bloque.moneda}`} valor={bloque.subtotal} moneda={bloque.moneda} />
            <Importe label="IVA trasladado" valor={bloque.iva} moneda={bloque.moneda} />
            {(!provisional || bloque.ret_isr > 0) && (
              <Importe label="ISR retenido" valor={-bloque.ret_isr || 0} moneda={bloque.moneda} />
            )}
            {bloque.ret_iva > 0 && <Importe label="IVA retenido" valor={-bloque.ret_iva} moneda={bloque.moneda} />}
            <div className="border-t pt-1 font-semibold">
              <Importe label={provisional ? "Total provisional" : "Total neto"} valor={bloque.total} moneda={bloque.moneda} />
            </div>
          </dl>
        ))}
      </div>
    </div>
  );
}

function Importe({ label, valor, moneda }: { label: string; valor: number; moneda: BloqueFiscal["moneda"] }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd>{formatCurrency(valor, moneda)}</dd>
    </div>
  );
}
