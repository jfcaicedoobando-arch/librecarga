import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CotizacionRow } from "@/features/cotizacion/types";
import type { TipoContenedorCatalogo } from "@/lib/domain/tipoContenedor";
import { TASA_IVA } from "@/lib/financial/financialUtils";
import { tasasEfectivas } from "@/lib/financial/etiquetaTasaIva";
import { formatDate, formatFechaDia } from "@/lib/formatters";
import { calcularTotales, splitConceptos } from "@/generators/cotizacion/conceptosTables";
import { fiscalCotizacionParaDocumento } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";
import { styles } from "../theme/styles";
import { NotasSection } from "../components/NotasSection";
import { Footer } from "../components/Footer";
import { DataTable } from "../components/DataTable";
import { TotalesBox } from "../components/TotalesBox";
import { BrandHeader, type EmisorInfo } from "../components/BrandHeader";
import { BillToBlock } from "../components/BillToBlock";
import { columnasUSD, columnasMXN, subnotaCliente, armarBloques } from "./cotizacionColumnas";
import {
  SeccionDatosYMercancia,
  SeccionProspecto,
  SeccionResumenRuta,
} from "./cotizacionSections";

interface Props {
  cotizacion: CotizacionRow;
  /** Aéreo: escalas de la tarifa ligada (null = directo, undefined = sin dato). */
  escalas?: string[] | null;
  tasaIva?: number;
  emisor?: EmisorInfo;
  tiposContenedor?: ReadonlyArray<TipoContenedorCatalogo>;
}

function documentAuthor(emisor?: EmisorInfo) {
  return emisor?.organizacionNombre || emisor?.razonSocial || "Empresa";
}

function ResumenFiscalPdf({ cotizacion, tasaIva }: { cotizacion: CotizacionRow; tasaIva: number }) {
  const fiscal = fiscalCotizacionParaDocumento(cotizacion);
  const conFiscal = fiscal.estado === "confirmado" || fiscal.estado === "pendiente";
  const totales = calcularTotales(cotizacion.conceptos_venta, tasaIva);
  const { usd, mxn } = splitConceptos(cotizacion.conceptos_venta);
  const hayIva = totales.ivaUSD > 0 || totales.ivaMXN > 0;
  const bloques = conFiscal ? fiscal.bloques.map((b) => ({ ...b, retIsr: b.ret_isr, retIva: b.ret_iva, provisional: fiscal.estado === "pendiente" }))
    : armarBloques(usd, mxn, totales, tasaIva);
  const notaFiscal = fiscal.estado === "pendiente"
    ? "Importes provisionales. La evaluación fiscal debe resolverse antes de enviar o aceptar esta cotización."
    : "Los impuestos se agrupan por tasa en el total del documento. Las columnas Base + IVA no descuentan retenciones.";
  return <TotalesBox bloques={bloques}
    nota={conFiscal ? notaFiscal : hayIva ? "* El IVA se aplica según el tratamiento fiscal de cada concepto." : undefined} />;

}

export function CotizacionDocument({ cotizacion, tasaIva = TASA_IVA, emisor, tiposContenedor = [], escalas }: Props) {
  const fiscal = fiscalCotizacionParaDocumento(cotizacion);
  const conFiscal = fiscal.estado === "confirmado" || fiscal.estado === "pendiente";
  const totales = calcularTotales(cotizacion.conceptos_venta, tasaIva);
  const { usd, mxn } = splitConceptos(cotizacion.conceptos_venta);
  const hayIvaUsd = tasasEfectivas(usd, tasaIva).length > 0 || totales.ivaUSD > 0;
  const hayIvaMxn = tasasEfectivas(mxn, tasaIva).length > 0 || totales.ivaMXN > 0;
  const nombre = cotizacion.es_prospecto
    ? `${cotizacion.prospecto_empresa} (Prospecto)`
    : cotizacion.cliente_nombre;

  const resumenTotales = <ResumenFiscalPdf cotizacion={cotizacion} tasaIva={tasaIva} />;

  const headerMeta = [
    { label: "Estado", value: cotizacion.estado },
    // W-12 (QA r2): `created_at.substring(0,10)` tomaba el día UTC (de 18:00 a
    // 23:59 CDMX ya es "mañana"). `formatFechaDia` formatea en la TZ de negocio.
    { label: "Fecha", value: formatFechaDia(cotizacion.created_at) },
    ...(cotizacion.fecha_vigencia
      ? [{ label: "Vigencia", value: formatDate(cotizacion.fecha_vigencia) }]
      : []),
  ];

  return (
    <Document title={`${cotizacion.folio} - Cotización`} author={documentAuthor(emisor)}>
      <Page size="LETTER" style={styles.page}>
        <BrandHeader
          tipoDocumento="Cotización"
          folio={cotizacion.folio}
          emisor={emisor}
          meta={headerMeta}
        />
        <BillToBlock
          titulo={cotizacion.es_prospecto ? "Destinatario (Prospecto)" : "Destinatario"}
          destinatario={{ nombre }}
        />
        <SeccionResumenRuta c={cotizacion} />
        <SeccionProspecto c={cotizacion} />
        <SeccionDatosYMercancia c={cotizacion} tiposContenedor={tiposContenedor} escalas={escalas} />

        {/* v13.823.77: el título arrastra al menos el encabezado de la tabla. */}
        <View wrap={false} minPresenceAhead={90}>
          <Text style={[styles.h3, { marginTop: 10 }]}>Conceptos de Venta</Text>
        </View>

        {usd.length > 0 ? (
          <>
            <Text style={styles.h4} minPresenceAhead={70}>Conceptos en USD</Text>
            <DataTable
              columns={columnasUSD(tasaIva, hayIvaUsd, conFiscal)}
              rows={usd}
              renderSubrow={subnotaCliente}
              afterLastRow={mxn.length === 0 ? resumenTotales : undefined}
            />
          </>
        ) : null}

        {mxn.length > 0 ? (
          <>
            <Text style={styles.h4} minPresenceAhead={70}>
              Conceptos en MXN{hayIvaMxn ? " + IVA" : ""}
            </Text>
            <DataTable
              columns={columnasMXN(tasaIva, hayIvaMxn, conFiscal)}
              rows={mxn}
              renderSubrow={subnotaCliente}
              afterLastRow={resumenTotales}
            />
          </>
        ) : null}

        {cotizacion.conceptos_venta.length === 0 ? <Text style={styles.emptyState}>Sin conceptos para mostrar.</Text> : null}
        {cotizacion.conceptos_venta.length === 0 ? resumenTotales : null}

        <NotasSection notas={cotizacion.notas} />

        <Footer emisor={emisor} empresaNombre={emisor?.razonSocial} />
      </Page>
    </Document>
  );
}
