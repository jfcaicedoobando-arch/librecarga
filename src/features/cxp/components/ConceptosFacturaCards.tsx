import { MoneyCell } from "@/components/shared/MoneyCell";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { ConceptoCfdiRow } from "@/features/cxp/hooks/useConceptosCfdiFactura";
import { totalLinea } from "@/features/cxp/utils/cuadreConceptos";
import { totalLineaConImpuestos } from "@/features/cxp/utils/resumenConceptos";

interface Props {
  lineas: ReadonlyArray<ConceptoCfdiRow>;
  moneda: string;
  hayIeps: boolean;
}

const IMPORTE_SIN_CORTE = "overflow-visible text-clip whitespace-normal break-words";

export function ConceptosFacturaCards({ lineas, moneda, hayIeps }: Props) {
  return (
    <ul className="space-y-3" aria-label="Conceptos de la factura">
      {lineas.map((linea, i) => {
        const importes = [
          { label: "Importe unit.", value: linea.monto },
          { label: "Total línea", value: totalLinea(linea) },
          { label: "IVA", value: linea.iva },
        ];
        if (hayIeps) importes.push({ label: "IEPS", value: linea.ieps });

        return (
          <li key={linea.id}>
            <Card>
              <CardContent density="tight" className="space-y-3">
                <CardTitle as="h4" className="break-words">
                  <span className="text-muted-foreground">#{i + 1}</span>{" "}
                  {linea.descripcion || "(Sin descripción)"}
                </CardTitle>
                <p className="text-body-sm text-muted-foreground">Cantidad {linea.cantidad}</p>
                <div className="grid grid-cols-2 gap-2">
                  {importes.map(({ label, value }) => (
                    <MoneyCell key={label} label={label} value={formatCurrency(value, moneda)} valueClassName={IMPORTE_SIN_CORTE} />
                  ))}
                </div>
                <MoneyCell label="Total con impuestos" value={formatCurrency(totalLineaConImpuestos(linea), moneda)}
                  valueClassName={IMPORTE_SIN_CORTE} highlight />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
