import {
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { useTableInstance } from "@/components/shared/dataTable/useTableInstance";

const ORDEN_INICIAL = "predeterminado";

export function OrdenTarifarioMenu<T extends object>({ tabla }: { tabla: ReturnType<typeof useTableInstance<T>> }) {
  const orden = tabla.state.sorting[0];
  const columnas = tabla.getAllLeafColumns().filter((columna) => columna.getCanSort());

  return (
    <>
      <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={orden?.id ?? ORDEN_INICIAL}
        onValueChange={(id) => tabla.setSorting(id === ORDEN_INICIAL ? [] : [{ id, desc: orden?.desc ?? false }])}
      >
        <DropdownMenuRadioItem value={ORDEN_INICIAL}>Orden predeterminado</DropdownMenuRadioItem>
        {columnas.map((columna) => (
          <DropdownMenuRadioItem key={columna.id} value={columna.id}>
            {typeof columna.columnDef.header === "string" ? columna.columnDef.header : columna.id}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        disabled={!orden}
        checked={orden?.desc ?? false}
        onCheckedChange={(desc) => { if (orden) tabla.setSorting([{ id: orden.id, desc }]); }}
      >
        Orden descendente
      </DropdownMenuCheckboxItem>
    </>
  );
}
