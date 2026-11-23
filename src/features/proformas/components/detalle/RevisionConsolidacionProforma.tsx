import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { useAprobarAjusteConsolidacion } from "../../hooks/useConsolidacionProforma";
import { leerAjusteConsolidacion } from "../../domain/proformaFiscal";
import type { ProformaDetalleFull } from "../../services";

export function RevisionConsolidacionProforma({ proforma }: { proforma: ProformaDetalleFull }) {
  const { puedeAprobar, aprobar, isPending } = useAprobarAjusteConsolidacion(proforma.organization_id);
  const ajuste = leerAjusteConsolidacion(proforma);
  if (!ajuste) return null;
  const activa = proforma.estado_proforma === "pendiente" && proforma.estado_cliente !== "rechazada";

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle>Ajuste de redondeo al consolidar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ajuste.importes.map(({ moneda, anterior, nuevo, diferencia }) => (
          <dl key={moneda} className="flex flex-wrap gap-x-8 gap-y-2 text-body-sm" aria-label={moneda}>
            <div>
              <dt>Suma de proformas · {moneda}</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(anterior, moneda)}</dd>
            </div>
            <div>
              <dt>Total consolidado · {moneda}</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(nuevo, moneda)}</dd>
            </div>
            <div>
              <dt>Diferencia · {moneda}</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(diferencia, moneda)}</dd>
            </div>
          </dl>
        ))}
        {ajuste.pendiente && activa && (
          <p className="text-body-sm text-muted-foreground">
            Se requiere aprobación de Contabilidad o Administración antes de enviar la proforma.
          </p>
        )}
        {!ajuste.pendiente && <p className="text-body-sm">Ajuste aprobado.</p>}
        {ajuste.pendiente && activa && puedeAprobar && (
          <Button size="sm" loading={isPending} onClick={() => aprobar({ proformaId: proforma.id, huella: ajuste.huella })}>
            Aprobar ajuste
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
