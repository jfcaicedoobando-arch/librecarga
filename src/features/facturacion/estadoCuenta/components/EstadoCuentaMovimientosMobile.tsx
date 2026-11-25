import { Link } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { GrupoMoneda, OrdenEstadoCuenta, SortEstadoCuenta } from "../services/estadoCuentaAging";
import { EstadoCuentaEstatusBadge } from "./EstadoCuentaEstatusBadge";
import { EstadoCuentaRowExpanded } from "./EstadoCuentaRowExpanded";

interface Props {
  grupos: GrupoMoneda[];
  expandidas: Set<string>;
  onToggle: (id: string) => void;
  facturaHref: (id: string) => string;
  sort: SortEstadoCuenta;
  onSort: (key: OrdenEstadoCuenta) => void;
}

export function EstadoCuentaMovimientosMobile({ grupos, expandidas, onToggle, facturaHref, sort, onSort }: Props) {
  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2">
        <Select value={sort.key} onValueChange={(value: OrdenEstadoCuenta) => onSort(value)}>
          <SelectTrigger aria-label="Ordenar movimientos" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fecha">Fecha de emisión</SelectItem>
            <SelectItem value="vencimiento">Vencimiento</SelectItem>
            <SelectItem value="saldo">Saldo</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" className="shrink-0" onClick={() => onSort(sort.key)}
          aria-label={sort.dir === "asc" ? "Orden ascendente. Cambiar a descendente" : "Orden descendente. Cambiar a ascendente"}>
          {sort.dir === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
        </Button>
      </div>
      {grupos.map((grupo) => (
        <section key={grupo.moneda} className="space-y-2" aria-label={"Movimientos en " + grupo.moneda}>
          <SectionHeading as="h3" variant="subsection">Movimientos en {grupo.moneda} · {grupo.filas.length} factura(s)</SectionHeading>
          <ul className="space-y-2">
            {grupo.filas.map((fila) => (
              <li key={fila.id}>
                <Card>
                  <CardContent density="compact" className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="link" size="sm" asChild className="h-auto p-0 font-medium">
                        <Link to={facturaHref(fila.id)}>{fila.numero}</Link>
                      </Button>
                      <EstadoCuentaEstatusBadge estatus={fila.estatus_cobranza} />
                    </div>
                    <MobileRowDetails fields={[
                      { label: "Emisión", value: formatDate(fila.fecha_emision) },
                      { label: "Vencimiento", value: formatDate(fila.fecha_vencimiento) },
                      { label: "Expediente", value: fila.expediente },
                      { label: "Días vencidos", value: fila.dias_vencido > 0 ? fila.dias_vencido : "—" },
                      { label: "Cargo", value: formatCurrency(fila.total, fila.moneda) },
                      { label: "Abono", value: formatCurrency(fila.pagado + fila.notas_credito_aplicadas, fila.moneda) },
                    ]} />
                    <MoneyCell label="Saldo" value={formatCurrency(fila.saldo, fila.moneda)} highlight />
                    <Collapsible open={expandidas.has(fila.id)} onOpenChange={() => onToggle(fila.id)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="min-h-11"
                          aria-label={"Pagos y notas de crédito de " + fila.numero}>Pagos y notas de crédito</Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <EstadoCuentaRowExpanded factura={fila} mobile />
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-subsection">Subtotal {grupo.moneda}</p>
          <div className="grid grid-cols-2 gap-2">
            <MoneyCell label="Cargos" value={formatCurrency(grupo.cargos, grupo.moneda)} />
            <MoneyCell label="Abonos" value={formatCurrency(grupo.abonos, grupo.moneda)} />
            <MoneyCell className="col-span-2" label="Saldo" value={formatCurrency(grupo.saldo, grupo.moneda)} highlight />
          </div>
        </section>
      ))}
    </div>
  );
}
