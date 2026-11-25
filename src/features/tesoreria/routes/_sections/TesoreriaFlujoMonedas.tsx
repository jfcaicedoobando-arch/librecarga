/**
 * Detalle por moneda del flujo esperado a 30 días.
 */
import { Table, TableBody, TableHeader, TableCell } from "@/components/ui/table";
import { DetailTableHead, DetailTableRow } from "@/components/shared/DetailTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";
import { useHorizontalScrollEdges } from "@/components/shared/dataTable/useHorizontalScrollEdges";
import { HorizontalScrollFades } from "@/components/shared/dataTable/HorizontalScrollFades";
import { renglonesFlujoMonedas } from "@/features/tesoreria/domain/flujoMonedas";
import type { FlujoMes } from "@/features/tesoreria/domain/resumen.types";

interface Props {
  flujo: FlujoMes;
}

export function TesoreriaFlujoMonedas({ flujo }: Props) {
  const { ref: scrollRef, atStart, atEnd, overflowing } = useHorizontalScrollEdges<HTMLDivElement>();
  const renglones = renglonesFlujoMonedas(flujo).map(({ moneda, cobrar, pagar, neto }) => ({
    moneda,
    cobrar: formatCurrency(cobrar, moneda),
    pagar: formatCurrency(pagar, moneda),
    neto: formatCurrency(neto, moneda),
    netoColor: neto >= 0 ? "text-success" : "text-destructive",
  }));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Flujo esperado 30 días por moneda</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 md:hidden">
          {renglones.map(({ moneda, cobrar, pagar, neto, netoColor }) => (
            <li key={moneda}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <h3 className="text-body font-medium">{moneda}</h3>
                  <dl className="break-words text-body tabular-nums">
                    <dt className="text-muted-foreground">Neto</dt>
                    <dd className={cn("font-semibold", netoColor)}>{neto}</dd>
                    <dt className="text-muted-foreground">Por cobrar</dt>
                    <dd className="text-success">{cobrar}</dd>
                    <dt className="text-muted-foreground">Por pagar</dt>
                    <dd className="text-warning">{pagar}</dd>
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
        <div className="relative hidden md:block">
          <div ref={scrollRef} className="overflow-x-auto [scrollbar-width:thin]">
            <Table className="min-w-[480px]">
              <TableHeader>
                <DetailTableRow hoverable={false}>
                  <DetailTableHead className="whitespace-nowrap">Moneda</DetailTableHead>
                  <DetailTableHead className="whitespace-nowrap text-right">Por cobrar</DetailTableHead>
                  <DetailTableHead className="whitespace-nowrap text-right">Por pagar</DetailTableHead>
                  <DetailTableHead className="whitespace-nowrap text-right">Neto</DetailTableHead>
                </DetailTableRow>
              </TableHeader>
              <TableBody>
                {renglones.map(({ moneda, cobrar, pagar, neto, netoColor }) => (
                  <DetailTableRow key={moneda}>
                    <TableCell className="font-medium whitespace-nowrap">{moneda}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-success">{cobrar}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-warning">{pagar}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right tabular-nums font-medium", netoColor)}>
                      {neto}
                    </TableCell>
                  </DetailTableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <HorizontalScrollFades overflowing={overflowing} atStart={atStart} atEnd={atEnd} />
        </div>
      </CardContent>
    </Card>
  );
}
