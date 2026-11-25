/**
 * /crm/analitica — Vista única (sin sub-tabs). Forecast, embudo, pérdidas y
 * leaderboard apilados verticalmente.
 *
 * Mantiene compatibilidad con el query param `?tab=…` previo: simplemente lo
 * ignora (los enlaces viejos siguen aterrizando aquí).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmSubheader } from "@/features/crm/components/CrmSubheader";
import { formatCurrencyCompact, formatPercent } from "@/lib/formatters";
import { useForecast, useReportesCRM } from "@/features/crm/hooks";
import LeaderboardVendedores from "@/features/crm/components/LeaderboardVendedores";
import { usePermissions, useDocumentTitle } from "@/hooks/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiStrip } from "@/components/shared/KpiStrip";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageContainer } from "@/components/shared/PageContainer";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { BarChart3, ThumbsDown } from "lucide-react";
import CrmEmbudoChart from "@/features/crm/components/analitica/CrmEmbudoChart";
import CrmForecastMensualChart from "@/features/crm/components/analitica/CrmForecastMensualChart";

import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ListSkeleton } from "@/components/shared/states/ListSkeleton";
import type { ForecastBucket } from "@/features/crm/domain/forecast";
import { CeldaMontoAnalitica } from "@/features/crm/routes/CeldaMontoAnalitica";

const METRICAS_PRONOSTICO = [
  { key: "pipeline", label: "Oportunidades abiertas" },
  { key: "ponderado", label: "Valor ponderado" },
  { key: "ganado", label: "Ganado" },
] as const;

function TablaPronostico({ filas, cargando, encabezado }: { filas: ForecastBucket[]; cargando: boolean; encabezado: string }) {
  const columns = defineColumns<ForecastBucket>([
    { id: "label", header: encabezado, cell: ({ row }) => row.original.label },
    { id: "moneda", header: "Moneda", cell: ({ row }) => row.original.moneda },
    ...METRICAS_PRONOSTICO.map(({ key, label }) => ({
      id: key, header: label, meta: { align: "right" as const },
      cell: ({ row }: { row: { original: ForecastBucket } }) =>
        <CeldaMontoAnalitica monto={row.original[key]} moneda={row.original.moneda} />,
    })),
    { id: "count", header: "Oportunidades", meta: { align: "right" }, cell: ({ row }) => row.original.count },
  ]);
  return (
    <ResponsiveDataTable columns={columns} data={filas} isLoading={cargando}
      rowKey={(fila) => fila.key} density={TABLE_DENSITY.embebida}
      emptyState={<EmptyStateInline icon={BarChart3} message="Sin datos" density="compact" />}
      mobileCard={(fila) => (
        <>
          <p className="flex flex-wrap justify-between gap-2 font-medium">
            <span className="break-words">{fila.label}</span><span>{fila.moneda}</span>
          </p>
          <MobileRowDetails fields={[
            ...METRICAS_PRONOSTICO.map(({ key, label }) => ({
              label, value: <CeldaMontoAnalitica monto={fila[key]} moneda={fila.moneda} />,
            })),
            { label: "Oportunidades", value: fila.count },
          ]} />
        </>
      )}
    />
  );
}

type FilaConversion = NonNullable<ReturnType<typeof useReportesCRM>["data"]>["porFuente"][number];
const columnasConversion = defineColumns<FilaConversion>([
  { id: "fuente", header: "Origen", cell: ({ row }) => row.original.fuente },
  { id: "total", header: "Total", meta: { align: "right" }, cell: ({ row }) => row.original.total },
  { id: "conv", header: "Conv.", meta: { align: "right" }, cell: ({ row }) => row.original.convertidos },
  { id: "tasa", header: "Tasa", meta: { align: "right" }, cell: ({ row }) => formatPercent(row.original.tasa) },
]);

function ForecastPanel() {
  const { data, isLoading, isError, refetch } = useForecast();
  const totales = data?.totalesPorMoneda ?? [];
  const porMes = data?.porMes ?? [];
  const porVendedor = data?.porVendedor ?? [];
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted-foreground">
        <strong className="text-foreground">Todas las fechas de cierre estimado.</strong>{" "}
        Incluye fechas anteriores al mes actual y oportunidades sin fecha; no es el total del mes.
        La columna Oportunidades cuenta también ganadas, perdidas y sin etapa clasificada.
      </p>
      <div className="space-y-4">
        {totales.length === 0 ? (
          <KpiStrip desktopCols={3} mobileStack>
            <KpiCard label="Oportunidades abiertas" value={formatCurrencyCompact(0, "MXN")} loading={isLoading} />
            <KpiCard label="Valor ponderado" value={formatCurrencyCompact(0, "MXN")} loading={isLoading} />
            <KpiCard label="Ganado" value={formatCurrencyCompact(0, "MXN")} loading={isLoading} variant="success" />
          </KpiStrip>
        ) : (
          totales.map((t) => (
            <KpiStrip key={t.moneda} desktopCols={3} mobileStack>
              <KpiCard label={`Oportunidades abiertas (${t.moneda})`} value={formatCurrencyCompact(t.totalPipeline, t.moneda)} loading={isLoading} />
              <KpiCard label={`Valor ponderado (${t.moneda})`} value={formatCurrencyCompact(t.totalPonderado, t.moneda)} loading={isLoading} />
              <KpiCard label={`Ganado (${t.moneda})`} value={formatCurrencyCompact(t.totalGanado, t.moneda)} loading={isLoading} variant="success" />
            </KpiStrip>
          ))
        )}
      </div>
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Por mes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <CrmForecastMensualChart porMes={porMes} isLoading={isLoading} />
            <TablaPronostico filas={porMes} cargando={isLoading} encabezado="Mes estimado" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle>Por vendedor</CardTitle></CardHeader>
          <CardContent>
            <TablaPronostico filas={porVendedor} cargando={isLoading} encabezado="Vendedor" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmbudoYPerdidas() {
  const { data, isLoading, isError, refetch } = useReportesCRM();
  const r = data ?? { embudo: [], porFuente: [], motivosPerdida: [] };
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle>Embudo</CardTitle></CardHeader>
        <CardContent>
          <CrmEmbudoChart embudo={r.embudo} isLoading={isLoading} />

        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Conversión por origen</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveDataTable columns={columnasConversion} data={r.porFuente} isLoading={isLoading}
            rowKey={(fila) => fila.fuente} density={TABLE_DENSITY.embebida}
            emptyState={<EmptyStateInline icon={BarChart3} message="Sin datos" density="compact" />}
            mobileCard={(fila) => (
              <>
                <p className="break-words font-medium">{fila.fuente}</p>
                <MobileRowDetails fields={[
                  { label: "Total", value: fila.total },
                  { label: "Convertidos", value: fila.convertidos },
                  { label: "Tasa", value: formatPercent(fila.tasa) },
                ]} />
              </>
            )}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Motivos de pérdida</CardTitle></CardHeader>
        <CardContent>
          {r.motivosPerdida.map((m) => (
            <div key={m.motivo} className="flex justify-between py-1 text-body border-b last:border-0">
              <span>{m.motivo}</span><span className="font-semibold tabular-nums">{m.cantidad}</span>
            </div>
          ))}
          {isLoading && <ListSkeleton rows={3} />}
          {!isLoading && r.motivosPerdida.length === 0 && <EmptyStateInline icon={ThumbsDown} message="Sin oportunidades perdidas" />}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Analitica() {
  useDocumentTitle("Analítica CRM");
  const { canEdit } = usePermissions();
  return (
    <PageContainer>
      <PageHeader
        title="Analítica CRM"
        description="Proyección de ventas, embudo de conversión y rendimiento por vendedor"
      />
      <CrmSubheader context="Proyección · Embudo · Pérdidas · Vendedores" />
      <ForecastPanel />
      <EmbudoYPerdidas />
      {canEdit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle>Desempeño de vendedores</CardTitle></CardHeader>
          <CardContent><LeaderboardVendedores /></CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
