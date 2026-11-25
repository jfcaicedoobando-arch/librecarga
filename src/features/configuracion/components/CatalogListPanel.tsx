import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { CatalogQueryError } from "@/components/shared/CatalogQueryError";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import SearchInput from "@/components/shared/SearchInput";

interface Props<T extends { id: string }> {
  nombrePlural: string;
  columns: ColumnDef<T, unknown>[];
  items: T[];
  filtered: T[];
  isVisible: (item: T) => boolean;
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    refetch: () => Promise<unknown>;
  };
  search: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    active: boolean;
  };
}

export function CatalogListPanel<T extends { id: string }>({
  nombrePlural, columns, items, filtered, isVisible, query, search,
}: Props<T>) {
  const { value, onChange, placeholder, active } = search;
  const { isLoading, isError, error, isFetching, refetch } = query;

  return (
    <>
      <SearchInput value={value} onChange={onChange} placeholder={placeholder} />
      <div className="max-h-[calc(100vh-20rem)] min-h-[320px] overflow-auto rounded-md border">
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          isError={isError}
          errorState={<CatalogQueryError error={error} onRetry={() => void refetch()} retrying={isFetching} />}
          emptyMessage={`No se encontraron ${nombrePlural}`}
          emptyState={items.length > 0 && active ? (
            <EmptyStateInline message="Sin coincidencias"
              action={{ label: "Limpiar búsqueda", onClick: () => onChange("") }} />
          ) : undefined}
          rowKey={(item) => item.id}
          rowClassName={(item) => isVisible(item) ? "" : "opacity-50"}
          density={TABLE_DENSITY.embebida}
        />
      </div>
      {!isLoading && !isError && (
        <div className="text-xs text-muted-foreground">
          {active && <p role="status">{filtered.length} de {items.length} {nombrePlural} coinciden con la búsqueda.</p>}
          <p>Catálogo completo · {items.length} {nombrePlural} en total · {items.filter(isVisible).length} visibles en mi empresa</p>
        </div>
      )}
    </>
  );
}
