/**
 * Embarques donde el agente autenticado figura como agente de carga.
 * Sólo lectura, sin datos comerciales (RLS lo restringe a esta vista mínima).
 * v13.172.17: migrado a `DataTable` (Fase 4 homologación).
 */
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { defineColumns, type ColumnDef } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { statusColumn } from "@/components/shared/dataTable/columnBuilders";
import { sortByString, sortByDate } from "@/components/shared/dataTable/sortingFns";
import { Ship } from "lucide-react";
import { useAgenteEmbarques } from "@/features/portal-agente/hooks";
import { useDocumentTitle } from "@/hooks/shared";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { etiquetaRutaTexto } from "@/features/costeo";
import { formatFechaDia } from "@/lib/formatters/dates";
import { etiquetaExpedienteAgente } from "./_sections/agenteEmbarqueLabels";
import { calcularEstadoEmbarque } from "@/features/embarques/domain/embarque";

type EmbarqueAgente = ReturnType<typeof useAgenteEmbarques>["data"] extends readonly (infer U)[] | undefined ? U : never;

function estadoVisible(e: EmbarqueAgente): string {
  return calcularEstadoEmbarque(e.modo, e.tipo, e.etd, e.eta, e.estado, e.fecha_llegada_real);
}

export default function AgenteEmbarques() {
  useDocumentTitle('Mis Embarques');
  const { data: embarques = [], isLoading, isError, refetch } = useAgenteEmbarques();
  const [busqueda, setBusqueda] = useState("");
  const buscador = useRef<HTMLInputElement>(null);
  const termino = busqueda.trim().toLocaleLowerCase("es-MX");
  const encontrados = useMemo(() => !termino ? embarques : embarques.filter((e) =>
    [etiquetaExpedienteAgente(e.expediente, e.id), e.bl_master].some(
      (dato) => dato?.toLocaleLowerCase("es-MX").includes(termino),
    ),
  ), [embarques, termino]);

  const columns = useMemo<ColumnDef<EmbarqueAgente, unknown>[]>(
    () => defineColumns<EmbarqueAgente>([
      {
        id: "expediente",
        header: "Expediente",
        accessorFn: (e) => etiquetaExpedienteAgente(e.expediente, e.id),
        sortFn: sortByString((e) => etiquetaExpedienteAgente(e.expediente, e.id)),
        enableSorting: true,
        meta: { sticky: true, className: "font-medium" },
        cell: ({ row }) => etiquetaExpedienteAgente(row.original.expediente, row.original.id),
      },
      {
        id: "modo",
        header: "Modo",
        accessorFn: (e) => e.modo,
        enableSorting: true,
        meta: { className: "text-xs" },
        cell: ({ row }) => row.original.modo,
      },
      {
        id: "ruta",
        header: "Ruta",
        accessorFn: (e) => etiquetaRutaTexto(e.puerto_origen, e.puerto_destino),
        meta: { className: "text-xs" },
        cell: ({ row }) => etiquetaRutaTexto(row.original.puerto_origen, row.original.puerto_destino),
      },
      {
        id: "bl_master",
        header: "BL Master",
        accessorFn: (e) => e.bl_master ?? "",
        meta: { className: "text-xs font-mono" },
        cell: ({ row }) => row.original.bl_master ?? "—",
      },
      {
        id: "etd",
        header: "ETD",
        accessorFn: (e) => e.etd,
        sortFn: sortByDate((e) => e.etd),
        enableSorting: true,
        meta: { className: "text-xs" },
        cell: ({ row }) => formatFechaDia(row.original.etd),
      },
      {
        id: "eta",
        header: "ETA",
        accessorFn: (e) => e.eta,
        sortFn: sortByDate((e) => e.eta),
        enableSorting: true,
        meta: { className: "text-xs" },
        cell: ({ row }) => formatFechaDia(row.original.eta),
      },
      statusColumn<EmbarqueAgente>({
        domain: "embarque",
        accessor: estadoVisible,
      }),
    ]),
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Ship className="h-6 w-6 text-accent" />}
        title="Mis embarques"
        description="Embarques donde figuras como agente de carga. Sólo lectura — sin datos comerciales del cliente final."
      />

      {!isLoading && !isError && embarques.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput ref={buscador} value={busqueda} onChange={setBusqueda}
            placeholder="Buscar por expediente o BL Master…" className="min-w-0 flex-1 sm:max-w-sm" />
          {busqueda && (
            <Button type="button" variant="outline" size="sm" onClick={() => { setBusqueda(""); buscador.current?.focus(); }}>
              Limpiar búsqueda
            </Button>
          )}
          {termino && <span role="status" className="text-body-sm text-muted-foreground">{encontrados.length} de {embarques.length} embarques</span>}
        </div>
      )}

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <ResponsiveDataTable<EmbarqueAgente>
        columns={columns}
        data={encontrados}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        emptyMessage={termino
          ? "Sin coincidencias por expediente o BL Master."
          : "Aún no hay embarques asignados a tu agente. Operaciones asigna embarques al agente cuando la cotización u operación lo vincula."}
        mobileCard={(e) => (
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium break-words">{etiquetaExpedienteAgente(e.expediente, e.id)}</span>
              <StatusBadge domain="embarque" status={estadoVisible(e)} />
            </div>
            <p className="text-body-sm break-words">{etiquetaRutaTexto(e.puerto_origen, e.puerto_destino)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {e.modo} · ETD {formatFechaDia(e.etd)} · ETA {formatFechaDia(e.eta)}
            </p>
            {e.bl_master && <p className="text-xs text-muted-foreground break-all">BL Master: {e.bl_master}</p>}
          </div>
        )}
      />
      )}

    </div>
  );
}
