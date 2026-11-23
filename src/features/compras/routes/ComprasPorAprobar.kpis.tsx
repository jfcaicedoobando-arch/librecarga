/** KPIs de la bandeja /compras/por-aprobar. Extraído por Power-of-10 #4. */
import { ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";
import { KpiCard } from "@/components/shared/KpiCard";
import { formatCurrency } from "@/lib/formatters";
import type { FacturaCxP } from "@/features/cxp/services";
import { sumarFacturasPorMoneda, textoConteoAprobacion, type ConsultaAprobacion } from "./ComprasPorAprobar.helpers";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

interface Props {
  pendientes: ConsultaAprobacion;
  aprobadas: ConsultaAprobacion;
  rechazadas: ConsultaAprobacion;
  rows: FacturaCxP[];
  aprobacion: string;
}

const formatearTotales = (facturas: FacturaCxP[]) => {
  const { MXN, USD, EUR } = sumarFacturasPorMoneda(facturas);
  return [formatCurrency(MXN, "MXN"), formatCurrency(USD, "USD"), EUR !== 0 && formatCurrency(EUR, "EUR")]
    .filter(Boolean).join(" · ");
};

const plural = (n: number) => (n === 1 ? "factura" : "facturas");

function textoKpi(consulta: ConsultaAprobacion) {
  const conteo = consulta.data?.length ?? 0;
  return consulta.isLoading || consulta.isError
    ? textoConteoAprobacion(consulta)
    : `${conteo} ${plural(conteo)}`;
}

export function ComprasPorAprobarKpis({
  pendientes, aprobadas, rechazadas, rows, aprobacion,
}: Props) {
  const fallidas = [pendientes, aprobadas, rechazadas].filter((consulta) => consulta.isError);
  return (<>
    {fallidas.length > 0 && <ErrorStateInline title="Algunos conteos están sin confirmar"
      message="La bandeja actual sigue disponible." retrying={fallidas.some((consulta) => consulta.isFetching)}
      onRetry={() => { void Promise.all(fallidas.map((consulta) => consulta.refetch())); }} />}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {!(aprobacion === "pendiente" && !pendientes.isLoading && !pendientes.isError && rows.length === pendientes.data?.length) && <KpiCard
        icon={ClipboardCheck}
        label="Pendientes"
        value={textoKpi(pendientes)}
        sublabel={!pendientes.isError && pendientes.data ? formatearTotales(pendientes.data) : undefined}
        variant="warning"
      />}
      <KpiCard icon={CheckCircle2} label="Aprobadas" value={textoKpi(aprobadas)} variant="success" />
      <KpiCard icon={XCircle} label="Rechazadas" value={textoKpi(rechazadas)} variant="destructive" />
      <KpiCard
        icon={ClipboardCheck}
        label={`Total en vista (${aprobacion})`}
        value={`${rows.length} ${plural(rows.length)}`}
        sublabel={formatearTotales(rows)}
      />
    </div>
  </>);
}
