import { useRef, useState } from "react";
import { exportToCsv } from "@/generators/exportCsv";
import { exportarLayoutContable } from "@/generators/layoutContable";
import { useRegistrarActividad } from "@/hooks/shared";
import { captureAuthOperationScope } from "@/lib/auth/authOperationScope";
import { todayLocalISO } from "@/lib/date/today";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { fetchFacturasParaExportar, type FacturasPaginaFilters } from "../services/facturasPagina";

const COLUMNAS = [
  { key: "numero", label: "# Factura" },
  { key: "expediente", label: "Expediente" },
  { key: "cliente", label: "Cliente" },
  { key: "total", label: "Monto" },
  { key: "moneda", label: "Moneda" },
  { key: "emision", label: "Emisión" },
  { key: "vencimiento", label: "Vencimiento" },
  { key: "estado", label: "Estado" },
];

export function useExportarFacturasEmitidas(
  filtros: Omit<FacturasPaginaFilters, "organizationId" | "page" | "pageSize">,
  puedeExportar: boolean,
) {
  const registrarActividad = useRegistrarActividad();
  const [exportando, setExportando] = useState(false);
  const enCurso = useRef(false);

  async function exportar(formato: "csv" | "layout") {
    if (!puedeExportar || enCurso.current) return;
    const scope = captureAuthOperationScope();
    enCurso.current = true;
    setExportando(true);
    try {
      const facturas = await fetchFacturasParaExportar(filtros, scope);
      scope.assertCurrent();
      if (!facturas.length) {
        notifyWarning(undefined, { title: "No hay facturas para exportar con estos filtros." });
        return;
      }
      if (formato === "layout") {
        await exportarLayoutContable(facturas, scope);
        scope.assertCurrent();
        registrarActividad.mutate({
          accion: "exportar", modulo: "facturas", entidad_id: "layout_contable",
          entidad_nombre: `Layout contable (${facturas.length} facturas)`,
          authScope: scope,
        });
      } else {
        exportToCsv(`facturas_${todayLocalISO()}.csv`, COLUMNAS, facturas.map((factura) => ({
          numero: factura.numero,
          expediente: factura.expediente,
          cliente: factura.cliente_nombre,
          total: factura.total,
          moneda: factura.moneda,
          emision: factura.fecha_emision,
          vencimiento: factura.fecha_vencimiento,
          estado: factura.estado,
        })));
      }
      notifySuccess(undefined, {
        title: formato === "layout" ? "Layout contable generado" : "CSV generado",
        description: `${facturas.length} facturas exportadas con los filtros actuales.`,
      });
    } catch (error) {
      if (scope.isCurrent()) {
        notifyError(undefined, { title: "No se pudo completar la exportación", error,
          method: "FACTURACION_EXPORTAR", context: { formato } });
      }
    } finally {
      enCurso.current = false;
      setExportando(false);
    }
  }

  return {
    exportando,
    exportacionDeshabilitada: exportando || !puedeExportar,
    exportarFacturasCsv: () => exportar("csv"),
    exportarLayoutContable: () => exportar("layout"),
  };
}
