import { useDocumentTitle } from "@/hooks/shared/useDocumentTitle";
import { useFiltroUrl } from "@/hooks/shared/useFiltroUrl";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useOptimisticSearchParams } from "nuqs/adapters/react-router/v8";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPagosProgramables,
  type FacturaProgramableRow,
} from "@/features/tesoreria/services/pagosProgramados";
import { agruparPorSemana, puedeEjecutarPago, type FacturaProgramable } from "@/features/tesoreria/domain/pagosProgramados";
import { tesoreria as tesoreriaKeys } from "@/features/tesoreria/queryKeys";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { LoadingState } from "@/components/shared/states/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCuentasBancarias } from "@/features/tesoreria/hooks/useTesoreriaCuentas";
import { useEjecutarPagoProgramado } from "@/features/tesoreria/hooks/useEjecutarPagoProgramado";
import { todayLocalISO } from "@/lib/date/today";
import { erroresPagoProgramado } from "@/features/tesoreria/domain/pagoProgramadoValidacion";
import { esPagoEfectivo } from "@/features/tesoreria/domain/conciliacionPago";
import { EjecutarPagoDialog, type FormPago } from "./_sections/EjecutarPagoDialog";
import { PagosProgramadosTablas } from "./_sections/PagosProgramadosTablas";
import { buildPagosProgramadosColumns, filtrarProgramables, FILTROS_BANDEJA, type FiltroBandeja } from "./_sections/pagosProgramadosColumns";
import { FILTRO_ANCHO } from "@/lib/ui/filterWidths";

export default function TesoreriaPagosProgramados() {
  useDocumentTitle("Pagos programados");
  // B-030: fetch directo sin filtro implícito de estado (antes la RPC
  // `cxp_por_pagar` ocultaba captura/Borrador/por aprobar con fecha).
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: tesoreriaKeys.pagosProgramables,
    queryFn: fetchPagosProgramables,
    staleTime: 30_000,
  });

  // Filtro EXPLÍCITO del usuario — por defecto se muestra todo.
  const [filtro, setFiltro] = useFiltroUrl("mostrar", FILTROS_BANDEJA, "todas");
  const [facturaPago, setFacturaPago] = useState<FacturaProgramable | null>(null);
  const [form, setForm] = useState<FormPago>({
    cuentaBancariaId: "", fecha: todayLocalISO(), monto: 0, metodoPago: "Transferencia", referencia: "",
  });

  const consultaCuentas = useCuentasBancarias();
  const cuentas = consultaCuentas.data;
  const ejecutarPago = useEjecutarPagoProgramado();
  const requestIdRef = useRef<string | null>(null);

  const cuentasCompatibles = useMemo(
    () => (cuentas ?? []).filter((c) => c.moneda === facturaPago?.moneda),
    [cuentas, facturaPago],
  );

  const abrirDialogoPago = (f: FacturaProgramable) => {
    setFacturaPago(f);
    // Ola 1 · idempotencia: una llave por apertura del diálogo. Si el usuario
    // da doble clic (o la red reintenta), la RPC devuelve el pago original.
    requestIdRef.current = crypto.randomUUID();
    setForm({
      cuentaBancariaId: "",
      fecha: todayLocalISO(),
      monto: f.saldo,
      metodoPago: "Transferencia",
      referencia: "",
      tipoCambio: f.moneda === "MXN" ? null : f.tipo_cambio_usd ?? null,
    });
  };

  const setField = <K extends keyof FormPago>(key: K, value: FormPago[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleEjecutar = async () => {
    if (!facturaPago || Object.keys(erroresPagoProgramado(form, facturaPago)).length > 0) return;
    await ejecutarPago.mutateAsync({
      facturaId: facturaPago.id,
      cuentaBancariaId: esPagoEfectivo(form.metodoPago) ? null : form.cuentaBancariaId,
      tipoCambio: form.tipoCambio,
      fecha: form.fecha,
      monto: form.monto,
      metodoPago: form.metodoPago,
      referencia: form.referencia,
      requestId: requestIdRef.current ?? undefined,
      moneda: facturaPago.moneda,
      proveedorNombre: facturaPago.proveedor_nombre,
    });
    requestIdRef.current = null;
    setFacturaPago(null);
  };

  const programables = useMemo(() => filtrarProgramables(data as FacturaProgramableRow[], filtro), [data, filtro]);

  const semanas = useMemo(() => agruparPorSemana(programables), [programables]);
  // B-030: pendientes sin fecha efectiva — antes se descartaban en silencio.
  const sinFecha = useMemo(
    () => programables.filter((r) => !r.fecha_programada_pago && !r.fecha_vencimiento),
    [programables],
  );

  // CI-02: "Programar pago" / "Revisar aprobación" navegan a la factura de
  // Compras vía callback.
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const search = useOptimisticSearchParams().toString();
  const abrirFactura = useCallback(
    (f: FacturaProgramable) => navigate(
      `/compras/facturas/${f.id}?tab=fiscal${puedeEjecutarPago(f) && !f.fecha_programada_pago ? "#programacion-pago" : ""}`,
      { state: { from: search ? `${pathname}?${search}` : pathname } },
    ),
    [navigate, pathname, search],
  );
  const columns = useMemo(
    () => buildPagosProgramadosColumns(abrirDialogoPago, abrirFactura),
    [abrirFactura],
  );

  // R-05: la bandeja debe ofrecer reintento si la consulta falla o se cuelga.
  if (isLoading || isError) {
    return (
      <PageContainer>
        <PageHeader title="Pagos programados" description="Bandeja semanal de Tesorería." />
        <LoadingState
          label="Cargando pagos programados…"
          error={isError}
          onRetry={() => { void refetch(); }}
          errorLabel="No se pudieron cargar los pagos programados."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Pagos programados"
        description="Bandeja semanal de Tesorería. Agrupación por fecha programada (o vencimiento)."
      />

      {/* B-030: filtro explícito y visible. Default: "Todas" para no ocultar
          facturas silenciosamente como hacía la RPC anterior. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mostrar-pagos-programados" className="text-body text-muted-foreground">Mostrar:</label>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroBandeja)}>
          <SelectTrigger id="mostrar-pagos-programados" className={`${FILTRO_ANCHO.lg} sm:min-w-[20rem]`}
            aria-describedby={filtro === "treinta_dias" ? "criterio-pagos-30-dias" : undefined}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las pendientes</SelectItem>
            <SelectItem value="programadas">Solo con pago programado</SelectItem>
            <SelectItem value="treinta_dias">Pago programado o vencimiento en 30 días</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filtro === "treinta_dias" && (
        <p id="criterio-pagos-30-dias" className="text-body-sm text-muted-foreground">
          Se usa la fecha de pago programado. Si no existe, se usa el vencimiento.
        </p>
      )}

      <PagosProgramadosTablas semanas={semanas} sinFecha={sinFecha} columns={columns}
        onVerTodas={filtro !== "todas" ? () => setFiltro("todas") : undefined}
        onEjecutarPago={abrirDialogoPago} onAbrirFactura={abrirFactura} />

      <EjecutarPagoDialog
        facturaPago={facturaPago}
        onClose={() => setFacturaPago(null)}
        cuentasCompatibles={cuentasCompatibles}
        consultaCuentas={consultaCuentas}
        form={form}
        setField={setField}
        onEjecutar={handleEjecutar}
        isPending={ejecutarPago.isPending}
      />
    </PageContainer>
  );
}
