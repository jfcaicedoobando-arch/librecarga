import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";
import { ListSkeleton } from "@/components/shared/states/ListSkeleton";
import { Badge } from "@/components/ui/badge";
import {
  usePortalPagosFactura,
  usePortalNotasCreditoFactura,
  usePortalResumenSaldoFactura,
} from "@/features/portal/hooks";
import { PORTAL_RELATED_MAX } from "@/features/portal/services/limits";
import { derivarSaldoPortal } from "./portalFacturaSaldo";
import { CheckCircle2, Clock, Receipt } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PortalFacturaPagosLista, type PortalPagoFila } from "./PortalFacturaPagosLista";
import {
  PortalFacturaNotasCreditoLista,
  type PortalNotaCreditoFila,
} from "./PortalFacturaNotasCreditoLista";
import { PortalFacturaTotales } from "./PortalFacturaTotales";

interface Props {
  facturaId: string;
  totalFactura: number;
  moneda: string;
  /** Estado de la factura: si es terminal (Pagada/Cancelada) el saldo es 0. */
  estadoFactura?: string | null;
}

function EstadoMovimientos({ consulta, titulo, children }: {
  consulta: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
  titulo: string;
  children: ReactNode;
}) {
  if (consulta.isLoading) return <ListSkeleton rows={2} />;
  if (consulta.isError) {
    return <ErrorStateInline title={titulo} message="Reintenta para recuperar los movimientos."
      onRetry={() => void consulta.refetch()} retrying={consulta.isFetching} />;
  }
  return children;
}

export default function PortalFacturaPagosCard({
  facturaId,
  totalFactura,
  moneda,
  estadoFactura,
}: Props) {
  const consultaPagos = usePortalPagosFactura(facturaId);
  const consultaNotas = usePortalNotasCreditoFactura(facturaId);
  const { data: pagos = [] } = consultaPagos;
  const { data: notasCredito = [] } = consultaNotas;
  // Defecto 7: los KPI (pagos, NC, saldo) vienen del agregado completo en BD.
  const consultaResumen = usePortalResumenSaldoFactura(facturaId);
  const resumen = consultaResumen.isError ? null : consultaResumen.data;

  const { totalPagado, totalNc, saldo, liquidada, hayMovimientos, listaTruncada } =
    derivarSaldoPortal(resumen, estadoFactura, pagos.length, notasCredito.length);
  const faltaResumen = !consultaResumen.isLoading && !resumen;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Pagos y notas de crédito</CardTitle>
        {hayMovimientos && (
          <Badge variant={liquidada ? "default" : "secondary"} className="gap-1">
            {liquidada ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {liquidada ? "Liquidada" : "Saldo pendiente"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <EstadoMovimientos consulta={consultaPagos} titulo="No pudimos consultar los pagos">
          {pagos.length === 0 ? (
            <EmptyStateInline icon={Receipt} message="Aún no se han registrado pagos para esta factura." />
          ) : (
            <PortalFacturaPagosLista
              // SAFE-CAST: la consulta del portal ya devuelve estas columnas del REP.
              pagos={pagos as unknown as PortalPagoFila[]}
              moneda={moneda}
            />
          )}
        </EstadoMovimientos>
        <EstadoMovimientos consulta={consultaNotas} titulo="No pudimos consultar las notas de crédito">
          {notasCredito.length > 0 && (
            <PortalFacturaNotasCreditoLista
              // SAFE-CAST: la consulta del portal ya devuelve estas columnas anidadas.
              notasCredito={notasCredito as unknown as PortalNotaCreditoFila[]}
              moneda={moneda}
            />
          )}
        </EstadoMovimientos>

        {listaTruncada && (
          <Alert>
            <AlertDescription>
              Se muestran los {PORTAL_RELATED_MAX} movimientos más recientes.
              {resumen && " Los totales y el saldo consideran todos los movimientos de la factura."}
            </AlertDescription>
          </Alert>
        )}

        {faltaResumen && <ErrorStateInline
          title={saldo === null ? "Saldo no disponible" : "Resumen de movimientos no disponible"}
          message="Reintenta para consultar los totales de la factura."
          onRetry={() => void consultaResumen.refetch()}
          retrying={consultaResumen.isFetching}
        />}
        {consultaResumen.isLoading ? <ListSkeleton rows={2} /> : <PortalFacturaTotales
          totalFactura={totalFactura}
          totalPagado={totalPagado}
          totalNc={totalNc}
          saldo={saldo}
          liquidada={liquidada}
          moneda={moneda}
        />}
      </CardContent>
    </Card>
  );
}
