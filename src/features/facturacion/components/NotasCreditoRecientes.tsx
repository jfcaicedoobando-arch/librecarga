/**
 * Card consolidada de Notas de Crédito recientes para la pestaña Cobranza
 * (G de la auditoría 13.49.0). Filtros por estado y cliente, totales por
 * moneda y enlace a la factura asociada.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, toTitleCase } from "@/lib/formatters";
import { useNotasCreditoRecientes, type EstadoNotaCredito } from "@/features/facturacion/hooks";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Checkbox } from "@/components/ui/checkbox";
import type { NotaCreditoConFactura } from "@/features/facturacion/services/notasCredito";
import { NotasCreditoRecientesListado } from "./NotasCreditoRecientesListado";
import { NotasCreditoZipButton } from "./NotasCreditoZipButton";
import { ESTADOS_NC_CON_CFDI } from "./notasCreditoZip.constants";
const LIMITE_NOTAS_RECIENTES = 200;
const ESTADOS: Array<EstadoNotaCredito | "todos"> = ["todos", "Borrador", "Aprobada", "Timbrada", "Aplicada", "Cancelada"];

function NotasCreditoRecientesDescargas({ notas, seleccion, onChange }: {
  notas: readonly NotaCreditoConFactura[];
  seleccion: ReadonlySet<string>;
  onChange: (seleccion: Set<string>) => void;
}) {
  const descargables = notas.filter((nota) => ESTADOS_NC_CON_CFDI.has(nota.estado));
  const seleccionadas = descargables.filter((nota) => seleccion.has(nota.id));
  const haySeleccion = seleccion.size > 0;

  return (
    <>
      {descargables.length > 0 && (
        <label className="inline-flex min-h-11 items-center gap-2 text-body-sm">
          <Checkbox
            checked={seleccionadas.length === descargables.length || (seleccionadas.length > 0 && "indeterminate")}
            onCheckedChange={(checked) => onChange(checked ? new Set(descargables.map((nota) => nota.id)) : new Set())}
          />
          Seleccionar todas las descargables
        </label>
      )}
      <NotasCreditoZipButton
        alcance={haySeleccion ? "seleccionadas" : "filtradas"}
        notas={haySeleccion ? seleccionadas : descargables}
      />
    </>
  );
}

export function NotasCreditoRecientes() {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<EstadoNotaCredito | "todos">("todos");
  const [cliente, setCliente] = useState<string>("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const { data = [], isLoading, isError, isFetching, refetch } = useNotasCreditoRecientes({
    estado, limit: LIMITE_NOTAS_RECIENTES,
  });
  const clientes = useMemo(() => {
    const set = new Map<string, string>();
    data.forEach((n) => { if (n.cliente_id) set.set(n.cliente_id, n.cliente_nombre); });
    return Array.from(set, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data]);

  const filtradas = useMemo(
    () => (cliente === "todos" ? data : data.filter((n) => n.cliente_id === cliente)),
    [data, cliente],
  );

  const totales = useMemo(() => {
    const acc: Record<string, number> = {};
    filtradas.forEach((n) => {
      if (n.estado === "Cancelada") return;
      acc[n.moneda] = (acc[n.moneda] ?? 0) + Number(n.monto);
    });
    return acc;
  }, [filtradas]);
  return (
    <Card>
      <CardContent className="p-0">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Mostrar u ocultar notas de crédito recientes"
          className="h-auto w-full flex items-center justify-between whitespace-normal rounded-none p-3 font-normal hover:bg-muted/30"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
            <span className="font-medium text-body">Notas de crédito recientes</span>
            {!isLoading && !isError && <span className="text-body-sm text-muted-foreground">({data.length})</span>}
            {!isError && Object.keys(totales).length > 0 && (
              <span className="text-body-sm text-muted-foreground">Importe de notas visibles sin canceladas</span>
            )}
            {!isError && Object.entries(totales).map(([mon, total]) => (
              <Badge key={mon} variant="outline" className="font-mono text-body-sm">
                {formatCurrency(total, mon)}
              </Badge>
            ))}
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {open && (
          <div className="border-t">
            <div className="p-3 flex flex-wrap gap-2 items-center">
              <p className="w-full text-body-sm text-muted-foreground">
                Hasta {LIMITE_NOTAS_RECIENTES} notas recientes del estado seleccionado. El filtro de cliente se aplica sobre esas notas.
              </p>
              <Select value={estado} onValueChange={(v) => {
                setEstado(v as EstadoNotaCredito | "todos");
                setSel(new Set());
              }}>
                <SelectTrigger className="w-[150px] h-8 text-body-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e === "todos" ? "Todos los estados" : e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cliente} onValueChange={(v) => {
                setCliente(v);
                setSel(new Set());
              }}>
                <SelectTrigger className="w-[220px] h-8 text-body-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los clientes</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{toTitleCase(c.nombre)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex-1" />
              {sel.size > 0 && <Button variant="ghost" size="sm" className="h-8" onClick={() => setSel(new Set())}>Limpiar selección</Button>}
              {!isError && <NotasCreditoRecientesDescargas notas={filtradas} seleccion={sel} onChange={setSel} />}
            </div>

            {isError ? (
              <ErrorStateInline
                title="No se pudieron cargar las notas de crédito recientes"
                message="Reintenta la consulta. Se conservarán tus filtros."
                onRetry={() => void refetch()}
                retrying={isFetching}
              />
            ) : isLoading ? (
              <EmptyStateInline loading message="Cargando…" />
            ) : filtradas.length === 0 ? (
              <EmptyStateInline icon={Receipt} message="No hay notas de crédito que coincidan." className="py-4" />
            ) : (
              <NotasCreditoRecientesListado notas={filtradas} seleccion={sel} onToggle={toggle} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
