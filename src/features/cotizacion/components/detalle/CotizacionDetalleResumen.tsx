import TablaConceptosGenerico from "../TablaConceptosGenerico";
import ResumenTotalesCotizacion from "../ResumenTotalesCotizacion";
import { ResumenFiscalCotizacion } from "../ResumenFiscalCotizacion";
import { RevisionFiscalCotizacion } from "./RevisionFiscalCotizacion";
import type { LecturaFiscalCotizacion } from "../../domain/snapshotFiscalCotizacion";
import type { CotizacionDetalleTotales } from "./cotizacionDetalleContenido.types";
import type { CotizacionRow } from "../../types";

export function CotizacionDetalleResumen({ totales, fiscal, cotizacion, permiteRevision }: {
  totales: CotizacionDetalleTotales;
  fiscal: LecturaFiscalCotizacion;
  cotizacion: CotizacionRow;
  permiteRevision: boolean;
}) {
  const {
    conceptosVentaUSD, conceptosVentaMXN,
    totalUSD, subtotalUSD, ivaUSD, subtotalMXN, ivaMXN, totalMXN,
  } = totales;
  return (
    <>
      <TablaConceptosGenerico moneda="USD" conceptos={conceptosVentaUSD} subtotal={subtotalUSD} iva={ivaUSD} total={totalUSD} showTotal={false} />
      <TablaConceptosGenerico moneda="MXN" conceptos={conceptosVentaMXN} subtotal={subtotalMXN} iva={ivaMXN} total={totalMXN} showTotal={false} />
      {fiscal.estado === "legacy" ? (
        <ResumenTotalesCotizacion
          totalUSD={totalUSD}
          totalMXN={totalMXN}
          ivaUSD={ivaUSD}
          ivaMXN={ivaMXN}
          mostrarUSD={conceptosVentaUSD.length > 0}
          mostrarMXN={conceptosVentaMXN.length > 0}
        />
      ) : "bloques" in fiscal ? (
        <ResumenFiscalCotizacion {...fiscal} />
      ) : (
        <ResumenFiscalCotizacion estado="revision" />
      )}
      {permiteRevision && fiscal.estado === "confirmado" && (
        <RevisionFiscalCotizacion cotizacion={cotizacion} fiscal={fiscal} />
      )}
    </>
  );
}
