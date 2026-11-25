/**
 * Vista de detalle para cotizaciones informativas (tarifarios).
 * Render dedicado: no muestra costos/utilidad ni botones de conversión a embarque.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { useVolver } from "@/hooks/shared/useVolver";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatDate, formatCurrency } from "@/lib/formatters";
import type { CotizacionRow } from "@/features/cotizacion/types";
import { parseTarifasInformativas } from "@/features/cotizacion/services";
import { useTiposContenedor } from "@/features/catalogos/hooks";
import { resolveTipoContenedorNombre } from "@/lib/domain/tipoContenedor";
import { captureAuthOperationScope } from "@/lib/auth/authOperationScope";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";

import { notifyError } from "@/lib/ui/appFeedback";

interface TarifaRow {
  id: string;
  modo: string;
  equipo: string;
  ruta: string;
  unidad: string;
  precio: string;
  notas: string;
}

const columns = defineColumns<TarifaRow>([
  { accessorKey: "modo", header: "Modo", enableSorting: false },
  { accessorKey: "equipo", header: "Modalidad/Equipo", enableSorting: false },
  { accessorKey: "ruta", header: "Ruta", enableSorting: false },
  { accessorKey: "unidad", header: "Unidad", enableSorting: false },
  { accessorKey: "precio", header: "Precio", enableSorting: false, meta: { align: "right", className: "tabular-nums" } },
  { accessorKey: "notas", header: "Notas", enableSorting: false, meta: { className: "text-muted-foreground" } },
]);

interface Props {
  cotizacion: CotizacionRow;
}

async function descargarTarifario(cotizacion: CotizacionRow) {
  const scope = captureAuthOperationScope();
  const [{ TarifarioDocument }, { descargarPdf }, { cargarEmisorDocumento }, { slugifyOrg }] = await Promise.all([
    import("@/pdf/documents/TarifarioDocument"),
    import("@/pdf/render/descargarPdf"),
    import("@/pdf/emisor"),
    import("@/lib/filenames"),
  ]);
  scope.assertCurrent();
  const emisor = await cargarEmisorDocumento(cotizacion.organization_id);
  scope.assertCurrent();
  await descargarPdf(
    <TarifarioDocument cotizacion={cotizacion} emisor={emisor} />,
    `${slugifyOrg(emisor.organizacionNombre || emisor.razonSocial)}_tarifario-${cotizacion.folio}`,
  );
}

export default function CotizacionInformativaDetalle({ cotizacion }: Props) {
  const volver = useVolver("/cotizaciones");
  const tarifas = parseTarifasInformativas(cotizacion.tarifas_informativas);
  const { data: tiposContenedor = [] } = useTiposContenedor();
  const filas = tarifas.map((t): TarifaRow => ({
    id: t.id,
    modo: t.modo,
    equipo: t.modalidad_equipo || resolveTipoContenedorNombre(t.tipo_contenedor, tiposContenedor),
    ruta: t.modo === "Terrestre" && t.modalidad_equipo === "Porta Contenedor" && t.punto_intermedio
      ? `${t.origen} → ${t.punto_intermedio} → ${t.destino}`
      : `${t.origen} → ${t.destino}`,
    unidad: t.unidad_medida,
    precio: formatCurrency(t.precio, t.moneda),
    notas: t.notas || "—",
  }));
  const [generando, setGenerando] = useState(false);
  const descargaEnCurso = useRef(false);

  const handleDescargar = async () => {
    if (descargaEnCurso.current) return;
    descargaEnCurso.current = true;
    setGenerando(true);
    try { await descargarTarifario(cotizacion); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar PDF";
      notifyError(undefined, { title: msg, error: e, method: "PAGES_COTIZACIONES_COTIZACIONINFORMATIVADETALLE_1" });
    } finally {
      descargaEnCurso.current = false;
      setGenerando(false);
    }
  };

  return (
    <PageContainer>
      <DetailHeader
        backTo={volver}
        backLabel="Volver a Cotizaciones"
        title={`Tarifario ${cotizacion.folio}`}
        subtitle={`Cliente: ${cotizacion.cliente_nombre}`}
        trailing={
          <Button onClick={handleDescargar} disabled={generando}>
            <Download className="h-4 w-4 mr-2" /> {generando ? "Generando PDF…" : "Exportar PDF"}
          </Button>
        }
      />


      <Card>
        <CardHeader><CardTitle>Vigencia</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body">
          <div>
            <p className="text-muted-foreground">Desde</p>
            <p className="font-medium">{cotizacion.vigencia_desde ? formatDate(cotizacion.vigencia_desde) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Hasta</p>
            <p className="font-medium">{cotizacion.vigencia_hasta ? formatDate(cotizacion.vigencia_hasta) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ejecutivo</p>
            <p className="font-medium">{cotizacion.operador}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Estado</p>
            <p className="font-medium">{cotizacion.estado}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tarifas ({tarifas.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ResponsiveDataTable
            columns={columns}
            data={filas}
            density={TABLE_DENSITY.embebida}
            rowKey={(fila) => fila.id}
            emptyMessage="Sin tarifas"
            mobileCard={(fila) => (
              <>
                <span className="font-medium">{fila.ruta}</span>
                <MobileRowDetails fields={[
                  { label: "Modo", value: fila.modo },
                  { label: "Modalidad/Equipo", value: fila.equipo },
                  { label: "Unidad", value: fila.unidad },
                  { label: "Precio", value: fila.precio },
                  { label: "Notas", value: fila.notas },
                ]} />
              </>
            )}
          />
        </CardContent>
      </Card>

      {cotizacion.notas && (
        <Card>
          <CardHeader><CardTitle>Notas y condiciones</CardTitle></CardHeader>
          <CardContent><p className="text-body whitespace-pre-wrap">{cotizacion.notas}</p></CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
