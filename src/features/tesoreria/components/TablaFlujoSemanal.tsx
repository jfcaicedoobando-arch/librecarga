/**
 * Tabla expandible: una fila por semana ISO con totales + detalle al click.
 * Nota: usa markup de detalle (no `DataTable`) porque cada fila expande un
 * bloque de detalle con `colSpan` — layout no soportado por `DataTable`.
 * Homologado con `DetailTable*` (encabezado, hover, zebra) y `whitespace-nowrap`
 * en todas las columnas para que "Flujo neto" y "Saldo proyectado" nunca
 * se corten al angostar el viewport (scrollea el contenedor, no las celdas).
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableHeader, TableBody, TableCell } from "@/components/ui/table";
import { DetailTableHead, DetailTableRow } from "@/components/shared/DetailTable";
import { formatCurrency } from "@/lib/formatters/numbers";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { useIsMobile } from "@/hooks/shared/useIsMobile";
import { Button } from "@/components/ui/button";
import type { DetalleFlujo, SemanaFlujo } from "@/features/tesoreria/services";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { cn } from "@/lib/utils";

interface Props { semanas: SemanaFlujo[]; saldoDisponible?: boolean }

export default function TablaFlujoSemanal({ semanas, saldoDisponible = true }: Props) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isMobile) return (
    <div className="space-y-3">
      {semanas.map((semana) => (
        <SemanaFlujoCard key={semana.semana_iso} semana={semana} saldoDisponible={saldoDisponible}
          open={expanded.has(semana.semana_iso)} onToggle={() => toggle(semana.semana_iso)} />
      ))}
    </div>
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <DetailTableRow hoverable={false}>
              <DetailTableHead className="w-8 whitespace-nowrap"></DetailTableHead>
              <DetailTableHead className="whitespace-nowrap">Semana</DetailTableHead>
              <DetailTableHead className="whitespace-nowrap">Periodo</DetailTableHead>
              <DetailTableHead className="whitespace-nowrap text-right">Entradas</DetailTableHead>
              <DetailTableHead className="whitespace-nowrap text-right">Salidas</DetailTableHead>
              <DetailTableHead className="whitespace-nowrap text-right">Flujo neto</DetailTableHead>
              <DetailTableHead className="whitespace-nowrap text-right">Saldo proyectado</DetailTableHead>
            </DetailTableRow>
          </TableHeader>
          <TableBody>
            {semanas.map((s, i) => {
              const isOpen = expanded.has(s.semana_iso);
              const saldoNeg = saldoDisponible && s.saldo_proyectado_mxn < 0;
              const striped = i % 2 === 1;
              return (
                <Fragment key={s.semana_iso}>
                  <DetailTableRow className={striped ? "bg-muted/20" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      <Button type="button" variant="ghost" size="icon" aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Colapsar" : "Expandir"} detalle de la semana ${s.semana_iso}`}
                        onClick={() => toggle(s.semana_iso)}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{s.semana_iso}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{s.inicio} → {s.fin}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-success">{formatCurrency(s.entradas_mxn, "MXN")}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-destructive">{formatCurrency(s.salidas_mxn, "MXN")}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right tabular-nums font-medium", s.flujo_neto_mxn >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(s.flujo_neto_mxn, "MXN")}
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right tabular-nums font-semibold", saldoNeg && "text-destructive")}>
                      {saldoDisponible ? formatCurrency(s.saldo_proyectado_mxn, "MXN") : "No disponible"}
                    </TableCell>
                  </DetailTableRow>
                  {isOpen && (
                    <DetailTableRow hoverable={false} className={striped ? "bg-muted/20" : undefined}>
                      <TableCell></TableCell>
                      <TableCell colSpan={6} className="text-body-sm">
                        <DetalleListas s={s} />
                      </TableCell>
                    </DetailTableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SemanaFlujoCard({ semana, saldoDisponible, open, onToggle }: {
  semana: SemanaFlujo;
  saldoDisponible: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="font-medium">{semana.semana_iso}</p>
        <p className="text-body-sm text-muted-foreground">{semana.inicio} → {semana.fin}</p>
        <MoneyCell label="Flujo neto" value={formatCurrency(semana.flujo_neto_mxn, "MXN")}
          valueClassName={semana.flujo_neto_mxn < 0 ? "text-destructive" : "text-success"} />
        <MoneyCell label="Saldo proyectado"
          value={saldoDisponible ? formatCurrency(semana.saldo_proyectado_mxn, "MXN") : "No disponible"}
          valueClassName={saldoDisponible && semana.saldo_proyectado_mxn < 0 ? "text-destructive" : undefined} />
        <Collapsible open={open} onOpenChange={onToggle}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">{open ? "Ocultar movimientos" : "Ver movimientos"}</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-2 pt-3">
              <MoneyCell label="Entradas" value={formatCurrency(semana.entradas_mxn, "MXN")} />
              <MoneyCell label="Salidas" value={formatCurrency(semana.salidas_mxn, "MXN")} />
            </div>
            <DetalleListas s={semana} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function DetalleListas({ s }: { s: SemanaFlujo }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 py-2">
      <div>
        <SectionHeading as="h3" variant="subsection" count={s.detalle_entradas.length} className="mb-1 text-success">
          Entradas
        </SectionHeading>
        {s.detalle_entradas.length === 0 ? (
          <EmptyStateInline message="Sin movimientos." density="compact" className="py-2" />
        ) : (
          <ul className="space-y-0.5">
            {s.detalle_entradas.map((d) => (
              <li key={d.id} className="flex justify-between border-b last:border-0 py-0.5">
                <span className="min-w-0 flex-1 mr-2"><DetalleDocumento d={d} /></span>
                <span className="tabular-nums">{formatCurrency(d.monto_mxn, "MXN")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <SectionHeading as="h3" variant="subsection" count={s.detalle_salidas.length} className="mb-1 text-destructive">
          Salidas
        </SectionHeading>
        {s.detalle_salidas.length === 0 ? (
          <EmptyStateInline message="Sin movimientos." density="compact" className="py-2" />
        ) : (
          <ul className="space-y-0.5">
            {s.detalle_salidas.map((d) => (
              <li key={d.id} className="flex justify-between border-b last:border-0 py-0.5">
                <span className="min-w-0 flex-1 mr-2"><DetalleDocumento d={d} /></span>
                <span className="tabular-nums">{formatCurrency(d.monto_mxn, "MXN")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DetalleDocumento({ d }: { d: DetalleFlujo }) {
  const montoOriginal = d.monto_original;
  const tcDocumento = d.tipo_cambio_aplicado;
  const conversion = d.moneda.toUpperCase() !== "MXN"
    && montoOriginal !== undefined && tcDocumento != null && tcDocumento > 0;
  return (
    <span className="block">
      <span className="block truncate">{d.concepto}</span>
      {conversion && (
        <span className="block text-caption text-muted-foreground">
          {formatCurrency(montoOriginal, d.moneda)} × TC documento {d.moneda}/MXN {tcDocumento.toFixed(4)}
        </span>
      )}
    </span>
  );
}
