import { useDocumentTitle } from "@/hooks/shared/useDocumentTitle";
/**
 * Tesorería › Estado de cuenta bancario (v13.450.0).
 *
 * Extracto tipo banco: saldo inicial del periodo, movimientos cronológicos con
 * saldo corrido, filtros por fecha/concepto/tipo y exportación a CSV/PDF.
 */
import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { AsyncBoundary } from "@/components/shared/states/AsyncBoundary";
import { KpiGridSkeleton } from "@/components/shared/skeletons";
import { CuentasBancariasEmptyState } from "@/features/tesoreria/components/CuentasBancariasEmptyState";
import { Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { BotonVerPago } from "@/features/tesoreria/components/BotonVerPago";
import { useCuentasBancarias } from "@/features/tesoreria/hooks";
import { useEstadoCuenta } from "@/features/tesoreria/hooks/useEstadoCuenta";
import {
  filtrarMovimientos, rangoMes,
  type MovimientoEstadoCuenta, type RangoFechas, type TipoMovimientoEstadoCuenta,
} from "@/features/tesoreria/domain/estadoCuenta";
import { DetallePagoSheet } from "@/features/tesoreria/components/DetallePagoSheet";
import type { RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import { estadoCuentaColumns } from "./_sections/estadoCuentaColumns";
import { EstadoCuentaToolbar } from "./_sections/EstadoCuentaToolbar";
import { EstadoCuentaResumen } from "./_sections/EstadoCuentaResumen";
import { EstadoCuentaMovimientosResumen } from "./_sections/EstadoCuentaMovimientosResumen";
import { EstadoCuentaExportButtons } from "./_sections/EstadoCuentaExportButtons";

function cuentasListas(cargando: boolean, error: boolean, cantidad: number) {
  return !cargando && !error && cantidad > 0;
}

export default function TesoreriaEstadoCuenta() {
  useDocumentTitle("Estado de cuenta");
  const { data: cuentas = [], isLoading: cargandoCuentas, isError: errorCuentas, refetch: recargarCuentas } = useCuentasBancarias();
  const { canAdminCuentasBancarias } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cuentaSolicitada = searchParams.get("cuenta") ?? "";
  const cuentaActual = errorCuentas ? undefined : cuentas.find((c) => c.id === cuentaSolicitada);
  const cuentaId = cuentaActual?.id ?? "";
  const [rango, setRango] = useState<RangoFechas>(() => rangoMes());
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<TipoMovimientoEstadoCuenta>("todos");
  const [refPago, setRefPago] = useState<RefPago | null>(null);

  const setCuentaId = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("cuenta", id); else next.delete("cuenta");
      return next;
    }, { replace: true });
  };

  const consulta = useEstadoCuenta(cuentaId || null, rango.desde, rango.hasta);
  const estado = consulta.data;
  const visibles = useMemo(
    () => filtrarMovimientos(estado?.movimientos ?? [], { texto, tipo }),
    [estado, texto, tipo],
  );
  const limpiarMovimientos = () => {
    setTexto("");
    setTipo("todos");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Estado de cuenta"
        description="Historial de entradas y salidas con saldo corrido, como el extracto del banco"
        actions={
          estado && !consulta.isError ? <EstadoCuentaExportButtons estado={estado} movimientos={visibles} filtros={{ texto, tipo }} /> : undefined
        }
      />

      {!cuentasListas(cargandoCuentas, errorCuentas, cuentas.length) ? (
        <AsyncBoundary isLoading={cargandoCuentas} isError={errorCuentas} onRetry={recargarCuentas}
          skeleton={<KpiGridSkeleton count={3} heightClass="h-32" desktopCols={3} />}
          errorTitle="No se pudieron cargar las cuentas bancarias">
          <Card><CardContent density="compact">
            <CuentasBancariasEmptyState puedeAdministrar={canAdminCuentasBancarias}
              onAdministrar={() => navigate("/tesoreria/cuentas")} />
          </CardContent></Card>
        </AsyncBoundary>
      ) : (
        <>
      <EstadoCuentaToolbar
        cuentas={cuentas}
        cuentaId={cuentaId}
        onCuentaChange={setCuentaId}
        rango={rango}
        onRangoChange={setRango}
        texto={texto}
        onTextoChange={setTexto}
        tipo={tipo}
        onTipoChange={setTipo}
      />

      {!cuentaId ? (
        <Card>
          <CardContent density="compact">
            <EmptyStateInline icon={Landmark} message={cuentaSolicitada
              ? "Esta cuenta ya no está disponible. Selecciona otra."
              : "Selecciona una cuenta para ver su estado de cuenta."} />
          </CardContent>
        </Card>
      ) : (
        <EstadoCuentaExtracto consulta={consulta} visibles={visibles}
          onAbrirPago={setRefPago} onLimpiarFiltros={limpiarMovimientos} />
      )}

        </>
      )}

      {refPago ? (
        <DetallePagoSheet
          ref_pago={refPago}
          onOpenChange={(open) => { if (!open) setRefPago(null); }}
        />
      ) : null}
    </PageContainer>
  );
}

function EstadoCuentaExtracto({ consulta, visibles, onAbrirPago, onLimpiarFiltros }: {
  consulta: ReturnType<typeof useEstadoCuenta>;
  visibles: MovimientoEstadoCuenta[];
  onAbrirPago: (pago: RefPago) => void;
  onLimpiarFiltros: () => void;
}) {
  const { data: estado, isLoading, isError, refetch } = consulta;
  const moneda = estado?.moneda ?? "MXN";
  const columns = useMemo(() => estadoCuentaColumns(moneda, onAbrirPago), [moneda, onAbrirPago]);
  const sinCobertura = estado?.cobertura_historica === "sin_cobertura";
  const filtradoSinResultados = !!estado?.movimientos.length && visibles.length === 0 && !sinCobertura;

  return (
    <AsyncBoundary
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      skeleton={<KpiGridSkeleton count={4} heightClass="h-28" desktopCols={4} />}
      errorTitle="No se pudo cargar el estado de cuenta"
      errorDescription="Los saldos y movimientos no están disponibles. Reintenta para consultar la misma cuenta y periodo."
    >
      {estado && (
        <>
          <EstadoCuentaResumen estado={estado} isLoading={false} />
          <div className="space-y-1">
            <EstadoCuentaMovimientosResumen estado={estado} visibles={visibles} moneda={moneda} />
            <ResponsiveDataTable
              columns={columns}
              data={visibles}
              rowKey={(m) => m.id}
              density={TABLE_DENSITY.listado}
              mobileCard={(movimiento) => (
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-label text-muted-foreground">{formatDate(movimiento.fecha)}</span>
                    <StatusBadge domain="conciliacion" status={movimiento.estado_conciliacion} />
                  </div>
                  <p className="break-words font-medium">{movimiento.concepto ?? "—"}</p>
                  {movimiento.referencia && <p className="break-words text-body-sm text-muted-foreground">Ref. {movimiento.referencia}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <MoneyCell label={movimiento.cargo > 0 ? "Salida" : "Entrada"}
                      value={formatCurrency(movimiento.cargo || movimiento.abono, moneda)} />
                    <MoneyCell label="Saldo" value={formatCurrency(movimiento.saldo_corrido, moneda)} highlight />
                  </div>
                  <BotonVerPago movimiento={movimiento} onVerPago={onAbrirPago} />
                </div>
              )}
              striped
              stickyHeader
              tableClassName="w-full"
              emptyState={filtradoSinResultados ? (
                <EmptyStateInline message="Ningún movimiento coincide con los filtros."
                  action={{ label: "Limpiar búsqueda y tipo", onClick: onLimpiarFiltros }} />
              ) : undefined}
              emptyMessage={sinCobertura ? "El periodo seleccionado es anterior al arranque de la cuenta. No hay cobertura histórica disponible." : "No hay movimientos en el periodo seleccionado."}
            />
          </div>
        </>
      )}
    </AsyncBoundary>
  );
}
