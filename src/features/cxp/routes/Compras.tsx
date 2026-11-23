/** Dashboard de compras, aprobaciones, pagos y antigüedad de saldos. */
import { useMemo, useState } from "react";
import { ShoppingCart, Plus, Inbox, ShieldCheck, Landmark, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { CargaGuard } from "@/components/shared/states/CargaGuard";
import { DialogNuevaFacturaProveedor } from "@/features/cxp/components/DialogNuevaFacturaProveedor";
import { useFacturasCxP } from "@/features/cxp/hooks";
import { useCxpPorCapturar } from "@/features/bandejas/hooks/useBandejas";
import { useCxpAging } from "@/features/cxp/hooks/useCxpAging";
import { useCxpPendientesAprobacion } from "@/features/cxp/hooks/useCxpPendientesAprobacion";
import { usePermissions } from "@/hooks/shared";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { TopProveedoresCard, UltimasFacturasCard } from "./_sections/ComprasDashboardCards";
import { KpiCard, LecturaCompra } from "./_sections/ComprasDashboardTiles";
import { ComprasAgingChart } from "./_sections/ComprasAgingChart";
import { ComprasCapturaTrend } from "./_sections/ComprasCapturaTrend";
import { ROUTES } from "@/constants/routes";

function rotulosPorAprobar(importes: Array<[number, string]>, pendientes: number) {
  if (pendientes === 0) return { sub: "sin pendientes" };
  const sub = importes.map(([monto, moneda]) => formatCurrencyCompact(monto, moneda)).join(" · ");
  return {
    sub: sub || "Importes no disponibles",
    detalle: importes.map(([monto, moneda]) => formatCurrency(monto, moneda)).join(" · ") || undefined,
  };
}

export default function Compras() {
  const { canCapturarFacturaProveedor } = usePermissions();
  const { data: cxp = [], kpis, isLoading, isError, refetch } = useFacturasCxP();
  const captura = useCxpPorCapturar();
  const { data: porCapturar = [] } = captura;
  const antiguedad = useCxpAging();
  const { rowsFiltradas: aging, totales: agingTotales, monedaActiva: agingMoneda } = antiguedad;
  const aprobacion = useCxpPendientesAprobacion();
  const { data: pendientesAprob = 0 } = aprobacion;
  const [openNueva, setOpenNueva] = useState(false);

  const metrics = useMemo(() => {
    const conSaldo = cxp.filter((f) => f.saldo > 0.01);
    const porAprobarPorMoneda = new Map<string, number>();
    for (const factura of cxp) {
      if (factura.estado_aprobacion !== "pendiente") continue;
      const moneda = factura.moneda.toUpperCase();
      porAprobarPorMoneda.set(moneda, (porAprobarPorMoneda.get(moneda) ?? 0) + Number(factura.total));
    }
    const porAprobarImportes = [...porAprobarPorMoneda].sort(([a], [b]) => a.localeCompare(b))
      .map(([moneda, monto]): [number, string] => [monto, moneda]);
    return {
      facturasConSaldo: conSaldo.length,
      embarquesPorCapturar: porCapturar.length,
      porAprobarImportes,
    };
  }, [cxp, porCapturar]);

  const topProveedores = useMemo(
    () => [...aging].sort((a, b) => b.saldo_total - a.saldo_total).slice(0, 5),
    [aging],
  );

  const ultimasFacturas = useMemo(
    () =>
      [...cxp]
        .sort((a, b) => (b.fecha_emision ?? "").localeCompare(a.fecha_emision ?? ""))
        .slice(0, 5),
    [cxp],
  );

  // MNY-NEW-07 (fix): el euro tiene cubeta propia; si no se toma en cuenta aquí
  // una factura EUR vencida se muestra como "al corriente". Nunca se suma EUR
  // como si fueran pesos: cada moneda se lista por separado.
  const importesVencidos: Array<[number, string]> = [
    [kpis.vencido_mxn, "MXN"], [kpis.vencido_usd, "USD"], [kpis.vencido_eur, "EUR"],
  ];
  const importes7d: Array<[number, string]> = [
    [kpis.por_vencer_7d_mxn, "MXN"], [kpis.por_vencer_7d_usd, "USD"], [kpis.por_vencer_7d_eur, "EUR"],
  ];
  const importesPorPagar: Array<[number, string]> = [
    [kpis.por_pagar_mxn, "MXN"], [kpis.por_pagar_usd, "USD"], [kpis.por_pagar_eur, "EUR"],
  ];
  const listar = (xs: Array<[number, string]>, compacto = true, minimo = 0.01) =>
    xs.filter(([m]) => m > minimo)
      .map(([m, cur]) => (compacto ? formatCurrencyCompact(m, cur) : formatCurrency(m, cur)))
      .join(" · ");
  const importesAprobacion = rotulosPorAprobar(metrics.porAprobarImportes, pendientesAprob);
  const hayVencido = importesVencidos.some(([m]) => m > 0.01);
  const hayPorVencer7d = importes7d.some(([m]) => m > 0.01);

  return (
    <PageContainer>
      <PageHeader
        icon={<ShoppingCart className="h-6 w-6 text-accent" />}
        title="Compras"
        description="Facturas de proveedor, aprobaciones y pagos."
        actions={canCapturarFacturaProveedor ? (
          <Button onClick={() => setOpenNueva(true)}>
            <Plus className="h-4 w-4 mr-2" /> Capturar factura
          </Button>
        ) : null}
      />

      <CargaGuard
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        errorTitle="No se pudo cargar el dashboard de compras"
        errorDescription="Revisa tu conexión y vuelve a intentar."
      >
      {/* Fila 1 · 4 KPIs accionables (cada uno navega a su bandeja) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          lectura={captura}
          label="Por capturar"
          value={metrics.embarquesPorCapturar}
          sub="embarques sin factura"
          to={ROUTES.COMPRAS_POR_CAPTURAR}
          icon={<Inbox className="h-4 w-4" />}
          tone={metrics.embarquesPorCapturar > 0 ? "info" : "default"}
          hint="Embarques con presupuesto operativo cargado pero aún sin factura de proveedor capturada."
        />
        <KpiCard
          lectura={aprobacion}
          label="Por aprobar"
          value={pendientesAprob}
          sub={importesAprobacion.sub}
          valueTooltip={importesAprobacion.detalle}
          to={ROUTES.COMPRAS_POR_APROBAR}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone={pendientesAprob > 0 ? "warn" : "default"}
          hint="Facturas capturadas esperando validación contable antes de pasar a 'Por pagar'."
        />
        <KpiCard
          label="Por pagar"
          value={listar(importesPorPagar, true, 0) || formatCurrency(0, "MXN")}
          sub={hayPorVencer7d ? `${listar(importes7d)} vencen en 7 d` : `${metrics.facturasConSaldo} facturas con saldo`}
          valueTooltip={listar(importesPorPagar, false, 0) || undefined}
          to={ROUTES.COMPRAS_POR_PAGAR}
          icon={<Landmark className="h-4 w-4" />}
          tone={hayPorVencer7d ? "warn" : "default"}
          hint="Saldo aprobado pendiente de pago. El sublabel adelanta lo que vence en 7 días si hay urgencia."
        />
        <KpiCard
          label="Vencido"
          // VF-05: "$0" pelado no indicaba moneda; se formatea con el canon.
          value={hayVencido ? listar(importesVencidos) : formatCurrency(0, "MXN")}
          sub={hayVencido ? `${kpis.facturas_vencidas} facturas vencidas` : "al corriente"}
          valueTooltip={hayVencido ? listar(importesVencidos, false) : undefined}
          to={ROUTES.COMPRAS_AGING}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={hayVencido ? "danger" : "success"}
          hint="Saldo total ya vencido, sumando todos los tramos de vencimiento. Selecciona para ver el desglose por proveedor."
        />
      </div>

      {/* Fila 2 · Gráficas ejecutivas: aging (2/3) + tendencia de captura (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <LecturaCompra titulo="Antigüedad de saldos" lectura={antiguedad}>
            <ComprasAgingChart totales={agingTotales} moneda={agingMoneda} />
          </LecturaCompra>
        </div>
        <div className="lg:col-span-1">
          <ComprasCapturaTrend rows={cxp} />
        </div>
      </div>

      {/* Fila 3 · Contexto de proveedores y capturas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LecturaCompra titulo="Proveedores con mayor saldo" lectura={antiguedad}>
          <TopProveedoresCard rows={topProveedores} />
        </LecturaCompra>
        <UltimasFacturasCard rows={ultimasFacturas} />
      </div>
      </CargaGuard>

      <DialogNuevaFacturaProveedor open={openNueva} onOpenChange={setOpenNueva} />
    </PageContainer>
  );
}
