import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { etiquetaTratamientoFila } from "@/lib/financial/etiquetaTratamientoFila";
import type { ConceptoProformaDocumento } from "@/features/proformas/domain/proformaFiscal";

export function ProformaConceptoMobileCard({ concepto }: { concepto: ConceptoProformaDocumento }) {
  const base = Number(concepto.cantidad) * Number(concepto.precio_unitario);
  return (
    <div className="space-y-2">
      <p className="font-medium text-body break-words">{concepto.descripcion || "—"}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="neutral" size="sm">IVA: {etiquetaTratamientoFila(concepto)}</Badge>
        <div className="text-right">
          <p className="text-label text-muted-foreground">Base · {concepto.moneda}</p>
          <p className="font-semibold tabular-nums">{formatCurrency(base, concepto.moneda)}</p>
        </div>
      </div>
    </div>
  );
}
