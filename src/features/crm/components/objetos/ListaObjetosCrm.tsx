/**
 * Lista paginada (servidor) con búsqueda para Empresas o Contactos del CRM.
 */
import { useMemo, type ReactNode } from "react";
import { createSerializer, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Building2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { useDebounce } from "@/hooks/shared";
import { OBJETOS_PAGE_SIZE, type Pagina } from "@/features/crm/services/objetosCrm";
import type { UseQueryResult } from "@tanstack/react-query";
import { useListaObjetosCrm } from "@/features/crm/hooks/useObjetosCrm";
import { usePuntajes } from "@/features/crm/hooks/useScoringCrm";
import { FiltroLetraSelect } from "@/features/crm/components/scoring/FiltroLetraSelect";
import { InsigniaPuntaje } from "@/features/crm/components/scoring/InsigniaPuntaje";
import { FiltroEstadoEmpresaSelect } from "@/features/crm/components/objetos/FiltroEstadoEmpresaSelect";
import { FILTRO_ESTADO_EMPRESA } from "@/features/crm/services/estadoEmpresaCrm";
const OBJETOS_FILTROS = {
  q: parseAsString.withDefault(""),
  pagina: parseAsInteger.withDefault(0),
  letra: parseAsStringLiteral(["todas", "A", "B", "C"]).withDefault("todas"),
  estado: parseAsStringLiteral(FILTRO_ESTADO_EMPRESA).withDefault("todos"),
};
const serializarFiltros = createSerializer(OBJETOS_FILTROS);

function DirectorioCrmVacio({ filtrado, empresa, limpiar, nuevaEmpresa }: {
  filtrado: boolean;
  empresa: boolean;
  limpiar: () => void;
  nuevaEmpresa?: () => void;
}) {
  if (filtrado) return (
    <EmptyStateInline icon={Search} message="Sin coincidencias con estos filtros"
      hint="Ajusta la búsqueda o limpia los filtros para ver el directorio."
      action={{ label: "Limpiar filtros", onClick: limpiar }} />
  );
  if (!empresa) return <EmptyStateInline message="Aún no hay contactos registrados" />;
  return (
    <EmptyStateInline icon={Building2} message="Aún no hay empresas registradas"
      hint={nuevaEmpresa ? "Registra la primera empresa para vincular contactos y oportunidades."
        : "Pide a alguien con permisos de edición en CRM que registre la primera empresa."}
      action={nuevaEmpresa ? { label: "Nueva empresa", onClick: nuevaEmpresa } : undefined} />
  );
}

export interface Columna<T> { titulo: string; celda: (fila: T) => ReactNode }

interface Props<T extends { id: string }> {
  placeholder: string;
  rutaBase: string;
  columnas: Columna<T>[];
  objeto: "empresa" | "contacto";
  onNuevaEmpresa?: () => void;
}

export function ListaObjetosCrm<T extends { id: string }>({ placeholder, rutaBase, columnas, objeto, onNuevaEmpresa }: Props<T>) {
  const [{ q: texto, pagina: paginaUrl, letra, estado }, setFiltros] = useQueryStates(OBJETOS_FILTROS);
  const pagina = Math.max(0, paginaUrl);
  const busqueda = useDebounce(texto, 300);
  const filtroEstado = objeto === "empresa" ? estado : "todos";
  // SAFE-CAST: `objeto` determina el tipo de fila que devuelve el servicio.
  const q = useListaObjetosCrm(objeto, busqueda, pagina, letra, filtroEstado) as UseQueryResult<Pagina<T>>;
  const conPuntaje = objeto === "empresa";
  const ids = useMemo(() => (conPuntaje ? q.data?.filas.map((f) => f.id) ?? [] : []), [conPuntaje, q.data]);
  const { data: puntajes } = usePuntajes("empresa", ids);
  const cols: Columna<T>[] = conPuntaje
    ? [...columnas, { titulo: "Puntaje", celda: (f) => <InsigniaPuntaje letra={puntajes?.get(f.id)?.letra} puntaje={puntajes?.get(f.id)?.puntaje} /> }]
    : columnas;
  const total = q.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / OBJETOS_PAGE_SIZE));
  const filtrado = Boolean(texto.trim()) || filtroEstado !== "todos" || letra !== "todas";
  const limpiar = () => void setFiltros({ q: null, letra: null, pagina: null, estado: null });
  const contexto = conPuntaje ? serializarFiltros({ q: texto, pagina, letra, estado }) : "";

  const tableColumns = defineColumns<T>(cols.map((c) => ({
    id: c.titulo, header: c.titulo, enableSorting: false,
    cell: ({ row }) => c.celda(row.original),
  })));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8" placeholder={placeholder} value={texto}
          onChange={(e) => { void setFiltros({ q: e.target.value, pagina: null }); }}
          aria-label={placeholder}
        />
      </div>
      {conPuntaje && <FiltroEstadoEmpresaSelect value={estado} onChange={(v) => { void setFiltros({ estado: v, pagina: null }); }} />}
      {conPuntaje && <FiltroLetraSelect value={letra} onChange={(v) => { void setFiltros({ letra: OBJETOS_FILTROS.letra.parse(v), pagina: null }); }} />}
      {filtrado && total > 0 && <Button type="button" size="sm" variant="ghost" onClick={limpiar}>Limpiar filtros</Button>}
      </div>
      <div className="rounded-md border">
        <DataTable columns={tableColumns} data={q.data?.filas ?? []} rowKey={(f) => f.id}
          getRowHref={(f) => `${rutaBase}/${f.id}${contexto}`} isLoading={q.isLoading} isError={q.isError}
          onRetry={() => void q.refetch()} density={TABLE_DENSITY.listado} sortMode="server"
          emptyState={<DirectorioCrmVacio filtrado={filtrado} empresa={conPuntaje} limpiar={limpiar} nuevaEmpresa={onNuevaEmpresa} />}
          pagination={{ page: pagina, totalPages: paginas,
            onPageChange: (value) => void setFiltros({ pagina: value }), pageSize: OBJETOS_PAGE_SIZE, total }} />
      </div>
    </div>
  );
}
