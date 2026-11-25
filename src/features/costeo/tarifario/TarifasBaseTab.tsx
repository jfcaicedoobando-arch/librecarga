/** Vista 1 del tarifario: Tarifas (Puertos base) con 20"/40" en una fila. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImportarTarifasDialog } from "./ImportarTarifasDialog";
import { ExtraerCorreoDialog } from "./ExtraerCorreoDialog";
import { TarifarioAcciones } from "./TarifarioAcciones";
import { OrdenTarifarioMenu } from "./OrdenTarifarioMenu";
import { OtrasTarifas, TarifaBaseCard } from "./TarifaBaseCard";
import { importeTarifario, rutaTarifarioMultimodo } from "./presentacionTarifario";
import { useOrdenTarifarioMovil } from "./useOrdenTarifarioMovil";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { costeo } from "../queryKeys";
import { TarifaForm } from "@/features/costeo/components/TarifaForm";
import { exportToCsv } from "@/generators/exportCsv";
import { ENCABEZADOS_TARIFARIO } from "./encabezadosTarifario";
import { formatDate } from "@/lib/formatters/dates";
import { hoyMx } from "@/lib/date/mx";
import { agruparTarifas, FILTROS_VIGENCIA, listarTarifasTarifario, type FilaTarifario, type FiltroVigencia } from "./tarifarioService";
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
  { id: "t20", header: 'Tarifa 20"', accessorFn: (f) => importeTarifario(f.tarifa20) },
  { id: "moneda20", header: 'Moneda 20"', accessorFn: (f) => f.tarifa20?.moneda ?? "—" },
  { id: "t40", header: 'Tarifa 40"', accessorFn: (f) => importeTarifario(f.tarifa40) },
  { id: "moneda40", header: 'Moneda 40"', accessorFn: (f) => f.tarifa40?.moneda ?? "—" },
  { id: "desde", header: "Inicio de la vigencia", accessorFn: (f) => fecha(f.base.vigente_desde) },
  { id: "hasta", header: "Término de la vigencia", accessorFn: (f) => fecha(f.base.vigente_hasta) },
  { id: "dias", header: "Días libres de demoras", accessorFn: (f) => f.base.dias_libres_demoras ?? "—" },
  { id: "obs", header: "Observaciones", accessorFn: (f) => f.base.notas ?? "" },
  { id: "otros", header: "Otras tarifas", cell: ({ row }) => <OtrasTarifas fila={row.original} /> },
]);

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
    return t ? all.filter((f) => [
      f.origen, f.destino, f.agente, f.naviera, ...f.otras.flatMap(rutaTarifarioMultimodo),
    ].join(" ").toLowerCase().includes(t)) : all;
  }, [q.data, texto]);
  const { movil, tabla, data } = useOrdenTarifarioMovil(filas, columns);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2 md:gap-3">
        <Input aria-label="Buscar origen, destino, agente o naviera" className="w-full md:max-w-xs" placeholder="Buscar origen, destino, agente o naviera" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroVigencia)}>
          <SelectTrigger className="min-w-32 flex-1 gap-1.5 md:w-auto md:flex-none" aria-label="Filtrar por vigencia">
            <span className="hidden text-body-sm text-muted-foreground md:inline">Vigencia:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_VIGENCIA.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
        <TarifarioAcciones puedeEditar={puedeEditar} movil={movil} ordenMovil={<OrdenTarifarioMenu tabla={tabla} />}
          cargando={q.isFetching} error={q.isError}
          hayFilas={filas.length > 0} onExtraer={() => setExtraer(true)}
          onImportar={() => setImportar(true)} onNueva={() => setNueva(true)}
          onDownload={() => exportToCsv(`tarifario-${hoyMx()}.csv`, ENCABEZADOS_TARIFARIO, filas.map(aCsv))} />
      </div>
      <ResponsiveDataTable columns={columns} data={data} rowKey={(f) => f.clave} isLoading={q.isLoading}
        mobileCard={(fila) => <TarifaBaseCard fila={fila} />} density={TABLE_DENSITY.listado}
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
