/**
 * Tarjeta "Anticipos a proveedores ligados a este embarque" (pestaña Costos).
 * Da visibilidad al dinero que ya salió del banco antes de recibir la factura.
 */
import { Ship } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/shared/ToneBadge";
import { formatCurrency } from "@/lib/formatters";
import { formatDate } from "@/lib/formatters/dates";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useAnticiposPorEmbarque } from "@/features/anticipos-proveedor/hooks/useAnticiposPorEmbarque";
import { useAplicadoEnEmbarque } from "@/features/anticipos-proveedor/hooks/useAplicadoEnEmbarque";

const ETIQUETA_ESTADO: Record<string, { texto: string; tone: "success" | "warning" | "neutral" | "destructive" }> = {
  disponible: { texto: "Pendiente de factura", tone: "warning" },
  aplicado_parcial: { texto: "Aplicado parcial", tone: "warning" },
  aplicado_total: { texto: "Aplicado a factura", tone: "success" },
  cancelado: { texto: "Cancelado", tone: "destructive" },
};

export function AnticiposEmbarqueCard({ embarqueId }: { embarqueId?: string }) {
  const lista = useAnticiposPorEmbarque(embarqueId);
  const aplicaciones = useAplicadoEnEmbarque(embarqueId);

  if (!embarqueId || lista.isLoading || (!lista.isError && lista.data.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ship className="h-4 w-4 text-muted-foreground" />
          Anticipos a proveedores de este embarque
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {lista.isError && (
          <ErrorStateInline title="No se pudieron consultar los anticipos" message="Reintenta para confirmar los anticipos de este embarque." onRetry={() => void lista.refetch()} retrying={lista.isFetching} />
        )}
        {aplicaciones.isError && lista.data.length > 0 && (
          <ErrorStateInline title="No se pudieron consultar los importes aplicados" message="Reintenta para verificar cuánto se cruzó con las facturas del embarque." onRetry={() => void aplicaciones.refetch()} retrying={aplicaciones.isFetching} />
        )}
        {lista.data.map((a) => {
          const et = ETIQUETA_ESTADO[a.estado] ?? { texto: a.estado, tone: "neutral" as const };
          return (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-medium">{a.proveedor_nombre ?? "Proveedor"}</p>
                <p className="text-body-sm text-muted-foreground">
                  {formatDate(a.fecha_anticipo)}
                  {a.referencia ? ` · Ref. ${a.referencia}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-body font-semibold tabular-nums">
                    {formatCurrency(Number(a.monto), a.moneda)}
                  </p>
                  <p className="text-body-sm text-muted-foreground tabular-nums">
                    Sin aplicar: {formatCurrency(Number(a.saldo_disponible), a.moneda)}
                  </p>
                  <p className="text-body-sm text-muted-foreground tabular-nums">
                    Cruzado con facturas de este embarque:{" "}
                    {aplicaciones.isError ? "Sin verificar" : aplicaciones.isLoading ? "Consultando…" : formatCurrency(Number(aplicaciones.data[a.id] ?? 0), a.moneda)}
                  </p>
                </div>
                <ToneBadge tone={et.tone}>{et.texto}</ToneBadge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
