/** Vista 1 del tarifario: Tarifas (Puertos base) con 20"/40" en una fila. */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Plus, Upload } from "lucide-react";
import { ImportarTarifasDialog } from "./ImportarTarifasDialog";
import { ExtraerCorreoDialog } from "./ExtraerCorreoDialog";
import { DescargarTarifarioButton } from "./DescargarTarifarioButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { costeo } from "../queryKeys";
import { TarifaForm } from "@/features/costeo/components/TarifaForm";
import { exportToCsv } from "@/generators/exportCsv";
import { ENCABEZADOS_TARIFARIO } from "./encabezadosTarifario";
import { formatCurrency, formatNumber } from "@/lib/formatters/numbers";
import { formatDate } from "@/lib/formatters/dates";
import { hoyMx } from "@/lib/date/mx";
import { agruparTarifas, FILTROS_VIGENCIA, listarTarifasTarifario, type FilaTarifario, type FiltroVigencia, type TarifaTarifario } from "./tarifarioService";

function importe(t: TarifaTarifario | null) {
  if (!t) return "—";
  return /^[A-Z]{3}$/.test(t.moneda) ? formatCurrency(t.flete_base, t.moneda) : formatNumber(t.flete_base);
}
const fecha = (d: string | null) => (d ? formatDate(d) : "—");

function aCsv(f: FilaTarifario) {
  return {
    origen: f.origen, destino: f.destino, tipo: "FCL", agente: f.agente, naviera: f.naviera,
    t20: f.tarifa20?.flete_base ?? "", moneda20: f.tarifa20?.moneda ?? "",
    t40: f.tarifa40?.flete_base ?? "", moneda40: f.tarifa40?.moneda ?? "",
    desde: f.base.vigente_desde ?? "", hasta: f.base.vigente_hasta ?? "",
    dias: f.base.dias_libres_demoras ?? "", obs: f.base.notas ?? "",
  };
}

const columns = defineColumns<FilaTarifario>([
  { accessorKey: "origen", header: "Origen" },
  { accessorKey: "destino", header: "Destino" },
  { id: "tipo", header: "Tipo de carga", accessorFn: () => "FCL" },
  { accessorKey: "agente", header: "Agente" },
  { accessorKey: "naviera", header: "Naviera" },
  { id: "t20", header: 'Tarifa 20"', accessorFn: (f) => importe(f.tarifa20) },
  { id: "moneda20", header: 'Moneda 20"', accessorFn: (f) => f.tarifa20?.moneda ?? "—" },
  { id: "t40", header: 'Tarifa 40"', accessorFn: (f) => importe(f.tarifa40) },
  { id: "moneda40", header: 'Moneda 40"', accessorFn: (f) => f.tarifa40?.moneda ?? "—" },
  { id: "desde", header: "Inicio de la vigencia", accessorFn: (f) => fecha(f.base.vigente_desde) },
  { id: "hasta", header: "Término de la vigencia", accessorFn: (f) => fecha(f.base.vigente_hasta) },
  { id: "dias", header: "Días libres de demoras", accessorFn: (f) => f.base.dias_libres_demoras ?? "—" },
  { id: "obs", header: "Observaciones", accessorFn: (f) => f.base.notas ?? "" },
  { id: "otros", header: "Otras tarifas", cell: ({ row }) => <OtrasTarifas fila={row.original} /> },
]);

function OtrasTarifas({ fila }: { fila: FilaTarifario }) {
  if (fila.otras.length === 0) return "—";
  const label = `Otras tarifas en el catálogo: ${fila.otras.length}`;
  if (!fila.base.ruta?.id) return label;
  return <Link to={`/costeo/tarifas?ruta=${encodeURIComponent(fila.base.ruta.id)}`}
    className="text-accent underline underline-offset-2">{label}</Link>;
}

export function TarifasBaseTab({ puedeEditar }: { puedeEditar: boolean }) {
  const [filtro, setFiltro] = useState<FiltroVigencia>("vigentes");
  const [texto, setTexto] = useState("");
  const [nueva, setNueva] = useState(false);
  const [importar, setImportar] = useState(false);
  const [extraer, setExtraer] = useState(false);
  const q = useQuery({ queryKey: costeo.tarifario.tarifas(filtro), queryFn: () => listarTarifasTarifario(filtro, hoyMx()) });
  const etiquetaFiltro = FILTROS_VIGENCIA.find((f) => f.valor === filtro)?.etiqueta ?? "";
  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const all = agruparTarifas(q.data ?? []);
    return t ? all.filter((f) => [f.origen, f.destino, f.agente, f.naviera].join(" ").toLowerCase().includes(t)) : all;
  }, [q.data, texto]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Buscar origen, destino, agente o naviera" className="max-w-xs" placeholder="Buscar origen, destino, agente o naviera" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroVigencia)}>
          <SelectTrigger className="w-auto gap-1.5" aria-label="Filtrar por vigencia">
            <span className="text-body-sm text-muted-foreground">Vigencia:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_VIGENCIA.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <DescargarTarifarioButton cargando={q.isFetching} error={q.isError} hayFilas={filas.length > 0}
            onDownload={() => exportToCsv(`tarifario-${hoyMx()}.csv`, ENCABEZADOS_TARIFARIO, filas.map(aCsv))} />
          {puedeEditar && <Button variant="outline" onClick={() => setExtraer(true)}><Mail className="mr-1 size-4" /> Extraer de correo</Button>}
          {puedeEditar && <Button variant="outline" onClick={() => setImportar(true)}><Upload className="mr-1 size-4" /> Importar CSV/Excel</Button>}
          {puedeEditar && <Button onClick={() => setNueva(true)}><Plus className="mr-1 size-4" /> Nueva tarifa</Button>}
        </div>
      </div>
      <DataTable columns={columns} data={filas} rowKey={(f) => f.clave} isLoading={q.isLoading}
        isError={q.isError} onRetry={() => { void q.refetch(); }}
        emptyState={texto.trim() ? <EmptyStateInline message="Ninguna tarifa coincide con esta búsqueda."
          action={{ label: "Limpiar búsqueda", onClick: () => setTexto("") }} /> : undefined}
        emptyMessage={filtro === "todas" ? "Sin tarifas capturadas." : `Sin tarifas ${etiquetaFiltro.toLowerCase()}.`} />
      <p className="text-caption text-muted-foreground">Para editar o duplicar una tarifa usa el catálogo de tarifas; la versión anterior se conserva como histórico.</p>
      {importar && <ImportarTarifasDialog open={importar} onOpenChange={setImportar} onDone={() => { void q.refetch(); }} />}
      {extraer && <ExtraerCorreoDialog open={extraer} onOpenChange={setExtraer} onDone={() => { void q.refetch(); }} />}
      {nueva && <TarifaForm open={nueva} onOpenChange={setNueva} onSaved={() => { void q.refetch(); }} />}
    </div>
  );
}
