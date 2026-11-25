import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FileSpreadsheet, Landmark } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";

import { PageHeader } from "@/components/shared/PageHeader";
import type { MovimientoManualInput } from "@/features/tesoreria/domain/movimientoManual";
import { useCuentasBancarias, useMovimientos, useConciliarPago, useConciliacionResumen, useRegistrarMovimientoManual, useSaldosCuentas } from "@/features/tesoreria/hooks";
import { useAutoConciliarExactos } from "@/features/tesoreria/hooks/useAutoConciliarExactos";
import { ResumenConciliacionCards } from "@/features/tesoreria/components/ResumenConciliacionCards";
import { PanelConciliacionMovimiento } from "@/features/tesoreria/components/PanelConciliacionMovimiento";
import { PageContainer } from "@/components/shared/PageContainer";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { crearMovimientoColumns } from "./movimientoColumns";
import { DetallePagoSheet } from "@/features/tesoreria/components/DetallePagoSheet";
import { MovimientoManualDialog } from "./MovimientoManualDialog";
import { ConciliacionToolbar } from "./ConciliacionToolbar";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useFiltroUrl } from "@/hooks/shared/useFiltroUrl";
import { useImportarEstadoCuenta } from "@/features/tesoreria/hooks/useImportarEstadoCuenta";
import { usePayloadRequestId, scopeDePayload } from "@/lib/idempotency";
import { ImportacionRevisionDialog } from "@/features/tesoreria/components/ImportacionRevisionDialog";
import { useCuentaConciliacion } from "@/features/tesoreria/hooks/useCuentaConciliacion";
import { useIsMobile } from "@/hooks/shared/useIsMobile";
import { ConciliacionMovimientosMobile } from "./ConciliacionMovimientosMobile";

const ESTADOS_MOVIMIENTO = ["Pendiente", "Conciliado", "Ignorado", "todos"] as const;

export function ConciliacionCuenta({ cuentaId: cuentaSolicitada, cambiarCuenta }: {
  cuentaId: string;
  cambiarCuenta: (id: string) => void;
}) {
  const mobile = useIsMobile();
  const consultaCuentas = useCuentasBancarias();
  const { cuenta, movimientoSeleccionado, panelKey, seleccionarMovimiento, cerrarMovimiento, refPago, setRefPago } =
    useCuentaConciliacion(consultaCuentas, cuentaSolicitada);
  const { cuentas, cuentaId, moneda, alias, mensajeSinCuenta, cuentasOcupadas } = cuenta;
  const { canCapturarMovimientoBancario } = usePermissions();
  // M8 (Ola 8): el estado del movimiento también viaja en la URL.
  const [estado, setEstado] = useFiltroUrl<"Pendiente" | "Conciliado" | "Ignorado" | "todos">(
    "estado",
    ESTADOS_MOVIMIENTO,
    "Pendiente",
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<Partial<MovimientoManualInput>>({
    tipo: "cargo",
  });
  // N4 + MNY: llave ligada al CONTENIDO del movimiento. Doble click o reintento
  // por red lenta reutilizan la misma llave y no duplican el movimiento; si el
  // usuario edita fecha, concepto o importe, la llave cambia.
  const claveManual = usePayloadRequestId();

  const { data: movs = [], isLoading, isError: movsError, refetch: refetchMovs } = useMovimientos(cuentaId ? { cuenta_bancaria_id: cuentaId, estado } : null);
  const resumen = useConciliacionResumen(cuentaId || null);
  const { data: saldos = [] } = useSaldosCuentas();
  const conciliarPago = useConciliarPago();
  const registrarManual = useRegistrarMovimientoManual();
  const importacion = useImportarEstadoCuenta(cuentaId);
  const columns = useMemo(() => crearMovimientoColumns(setRefPago, moneda), [setRefPago, moneda]);
  const { isAutoConciliando, handleConciliarExactos } = useAutoConciliarExactos(movs, conciliarPago.mutateAsync);

  const abrirModalManual = () => {
    setManualForm({ cuentaBancariaId: cuentaId || undefined, fecha: undefined, concepto: "", referencia: "", tipo: "cargo", monto: undefined });
    claveManual.reset();
    setManualOpen(true);
  };

  const setManualField = <K extends keyof MovimientoManualInput>(key: K, value: MovimientoManualInput[K]) =>
    setManualForm((prev) => ({ ...prev, [key]: value }));

  const handleGuardarManual = async () => {
    const { cuentaBancariaId, fecha, concepto, referencia, tipo, monto } = manualForm as MovimientoManualInput;
    await registrarManual.mutateAsync({
      cuentaBancariaId,
      fecha,
      concepto,
      referencia,
      cargo: tipo === "cargo" ? monto : 0,
      abono: tipo === "abono" ? monto : 0,
      claveIdempotencia: claveManual.get(
        scopeDePayload([cuentaBancariaId, fecha, concepto, referencia, tipo, monto]),
      ),
    });
    claveManual.reset();
    setManualOpen(false);
  };

  const pendientesCount = movs.filter((m) => m.estado_conciliacion === "Pendiente").length;

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Conciliación bancaria"
        description="Importa el estado de cuenta y empareja con CxC/CxP"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`${ROUTES.TESORERIA_ESTADO_CUENTA}${cuentaId ? `?cuenta=${cuentaId}` : ""}`}>
              <Landmark className="h-4 w-4" aria-hidden /> Ver estado de cuenta
            </Link>
          </Button>
        }
      />
      <ConciliacionToolbar
        cuentas={cuentas}
        cuentaId={cuentaId}
        cuentasLoading={consultaCuentas.isLoading}
        cuentasError={consultaCuentas.isError}
        reintentandoCuentas={consultaCuentas.isFetching}
        onRetryCuentas={() => void consultaCuentas.refetch()}
        onCuentaChange={cambiarCuenta}
        estado={estado}
        onEstadoChange={setEstado}
        pendientesCount={pendientesCount}
        pendientesCuenta={resumen.isError ? undefined : resumen.data?.pendientes}
        isAutoConciliando={isAutoConciliando}
        onConciliarExactos={handleConciliarExactos}
        onAbrirManual={abrirModalManual}
        fileRef={importacion.fileRef}
        onFile={importacion.handleFile}
        importando={importacion.importando}
        puedeCapturar={canCapturarMovimientoBancario}
      />

      {cuentasOcupadas ? null : !cuentaId ? (
        <Card>
          <CardContent density="compact">
            <EmptyStateInline icon={FileSpreadsheet} message={mensajeSinCuenta} />
          </CardContent>
        </Card>
      ) : (
        <>
        <ResumenConciliacionCards
          resumen={resumen.data}
          moneda={moneda}
          saldo={saldos.find((s) => s.id === cuentaId)?.saldo}
          isLoading={resumen.isLoading}
          isError={resumen.isError}
          retrying={resumen.isFetching}
          onRetry={() => void resumen.refetch()}
        />
        {mobile ? (
          <ConciliacionMovimientosMobile columns={columns} movimientos={movs} isLoading={isLoading}
            isError={movsError} onRetry={() => void refetchMovs()} seleccionado={movimientoSeleccionado}
            onSeleccionar={seleccionarMovimiento} onCerrar={cerrarMovimiento} onVerPago={setRefPago}
            moneda={moneda} alias={alias} />
        ) : <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-1">
            <div className="text-body-sm text-muted-foreground px-1 flex justify-between">
              <span>{movs.length} movimientos · {alias}</span>
            </div>
            <VirtualDataTable
              columns={columns}
              data={movs}
              rowKey={(m) => m.id}
              onRowClick={seleccionarMovimiento}
              rowClassName={(m) => (movimientoSeleccionado?.id === m.id ? "bg-accent/10" : "")}
              isLoading={isLoading}
              isError={movsError}
              onRetry={() => void refetchMovs()}
              emptyMessage="No hay movimientos."
              maxHeight={560}
            />
          </div>
          <div className="lg:col-span-1">
            <PanelConciliacionMovimiento
              key={panelKey}
              movimiento={movimientoSeleccionado}
              onClose={cerrarMovimiento}
              moneda={moneda}
            />
          </div>
        </div>}
        </>
      )}

      <MovimientoManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        cuentas={cuentas}
        manualForm={manualForm}
        setManualField={setManualField}
        onGuardar={handleGuardarManual}
        isPending={registrarManual.isPending}
      />
      <ImportacionRevisionDialog revision={importacion.revision} confirmando={importacion.confirmando}
        onConfirm={() => void importacion.confirmarRevision()} onCancel={importacion.cancelarRevision} />

      {refPago ? (
        <DetallePagoSheet
          ref_pago={refPago}
          onOpenChange={(open) => { if (!open) setRefPago(null); }}
        />
      ) : null}
    </PageContainer>
  );
}
