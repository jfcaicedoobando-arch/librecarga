import { roundMoney } from "@/lib/financial/financialUtils";
/**
 * Tabla de reparto del pago en lote (v13.445.0).
 * Rediseñada v13.498.0 con el formato del cobro en lote (CxC): zebra, badges
 * de estado y campo de dinero alineado a la derecha.
 */
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, toTitleCase } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { LoteRenglonesTable } from "@/components/shared/LoteRenglonesTable";
import { Link } from "react-router";
import type { FacturaLoteCandidata, RenglonLote } from "@/features/cxp/services/pagoProveedorLote";

import { TableCell, TableRow } from "@/components/ui/table";
interface Props {
  facturas: FacturaLoteCandidata[];
  renglones: RenglonLote[];
  moneda: string;
  onMontoChange: (facturaId: string, monto: number) => void;
}

export function DialogPagoLoteRenglones({ facturas, renglones, moneda, onMontoChange }: Props) {
  const montoDe = (id: string) => renglones.find((r) => r.factura_id === id)?.monto ?? 0;

  return (
    <LoteRenglonesTable minWidthClassName="min-w-[620px]" etiquetaSaldoFinal="Saldo previsto">

          {facturas.map((f, i) => {
            const monto = montoDe(f.factura_id);
            const aprobada = f.estado_aprobacion === undefined || f.estado_aprobacion === "aprobada";
            const queda = Math.max(0, roundMoney(f.saldo - monto));
            const liquidada = monto > 0 && queda <= 0.005;
            const parcial = monto > 0 && !liquidada;
            const folio = toTitleCase(f.folio_proveedor ?? "");
            const identificador = folio || `Factura ${i + 1} · sin folio proveedor`;
            return (
              <TableRow key={f.factura_id} className={cn("border-t", i % 2 === 1 && "bg-muted/20")}>
                <TableCell className="font-mono text-body-sm">
                  {folio || (
                    <Link to={`/compras/facturas/${encodeURIComponent(f.factura_id)}`} target="_blank" rel="noopener noreferrer"
                      aria-label={`Ver ${identificador} en otra pestaña`}
                      className="text-accent underline underline-offset-2">
                      {identificador}
                    </Link>
                  )}
                  {!aprobada && <Badge variant="warning" size="sm">Requiere aprobación</Badge>}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(f.saldo, moneda)}
                </TableCell>
                <TableCell>
                  <MoneyInput
                    className="ml-auto h-9 w-full max-w-[150px] text-right"
                    value={monto === 0 ? null : monto}
                    currency={moneda}
                    disabled={!aprobada}
                    aria-label={`Importe aplicado a ${identificador}`}
                    onChange={(n: number) => onMontoChange(f.factura_id, n)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {liquidada && (
                      <Badge variant="outline" className="text-label">Quedará liquidada</Badge>
                    )}
                    {parcial && (
                      <Badge variant="secondary" className="text-label">Pago parcial propuesto</Badge>
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(queda, moneda)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
    </LoteRenglonesTable>
  );
}
