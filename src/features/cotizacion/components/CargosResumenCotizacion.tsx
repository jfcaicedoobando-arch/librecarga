import { WizardSection } from "@/components/shared/WizardSection";
import { formatCurrency } from "@/lib/formatters";
import type { ConceptoVentaCotizacion } from "@/features/cotizacion/types";
import { conceptoConCodigo } from "@/features/costeo/domain/catalogoCargos/conceptoConCodigo";

/** Cargos que verá el cliente, con el código del catálogo único. */
export default function CargosResumenCotizacion({ conceptos }: { conceptos: ConceptoVentaCotizacion[] }) {
  const filas = conceptos.filter((c) => c.descripcion?.trim());
  if (filas.length === 0) return null;
  return (
    <WizardSection title="Cargos para el cliente">
      <ul className="divide-y divide-border">
        {filas.map((c, i) => (
          <li key={c.id ?? `${c.descripcion}-${i}`} className="flex justify-between gap-4 py-2 text-body">
            <span>{conceptoConCodigo(c.descripcion)}</span>
            <span className="tabular-nums text-muted-foreground">
              {c.cantidad} × {formatCurrency(c.precio_unitario, c.moneda)}
            </span>
          </li>
        ))}
      </ul>
    </WizardSection>
  );
}
