/**
 * Una fila de `DataTableBody`. Se extrajo del cuerpo de la tabla para respetar
 * el límite de complejidad ciclomática (ESLint 16) y mantener el body legible.
 */
import { flexRender } from "@tanstack/react-table";
import type { Cell, Row } from "@/components/shared/dataTable/tanstackTypes";
import type { NavigateFunction } from "react-router";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ALIGN_CLASS, type ColumnAlign } from "./types";
import {
  buildRowAuxClickHandler,
  buildRowClickHandler,
  buildRowKeyDownHandler,
  type RowBehavior,
} from "./rowHandlers";
import "./columnMeta";

const STICKY_LEFT =
  "sticky left-0 z-sticky bg-background [tr:nth-child(even)_&]:bg-muted border-r border-border/60";
const STICKY_RIGHT =
  "sticky right-0 z-sticky bg-background [tr:nth-child(even)_&]:bg-muted border-l border-border/60";

interface Props<T extends object> {
  row: Row<T>;
  cellPad: string;
  borderCell: string;
  striped: boolean;
  hoverable: boolean;
  selectionMode: boolean;
  navigate: NavigateFunction;
  rowClassName?: (item: T) => string;
  onRowClick?: (item: T) => void;
  onRowMouseEnter?: (item: T) => void;
  getRowHref?: (item: T) => string | null;
  getRowAriaLabel?: (item: T) => string;
}

export function DataTableRow<T extends object>({
  row, cellPad, borderCell, striped, hoverable, selectionMode, navigate,
  rowClassName, onRowClick, onRowMouseEnter, getRowHref, getRowAriaLabel,
}: Props<T>) {
  const item = row.original;
  const seleccionable = selectionMode && row.getCanSelect();
  const href = seleccionable ? null : (getRowHref?.(item) ?? null);
  const navigable = !!href;
  const clickable = navigable || !!onRowClick || seleccionable;
  const rowRole = getRowRole(navigable, seleccionable, Boolean(onRowClick));

  const behavior: RowBehavior<T> = {
    item, href, seleccionable, navigable, navigate, onRowClick,
    toggleSelected: () => row.toggleSelected(!row.getIsSelected()),
  };

  return (
    <TableRow
      className={cn(rowClasses({ clickable, striped, hoverable }), rowClassName?.(item))}
      role={rowRole}
      tabIndex={clickable ? 0 : undefined}
      aria-selected={seleccionable ? row.getIsSelected() : undefined}
      aria-label={rowRole ? getRowAriaLabel?.(item) : undefined}
      onClick={buildRowClickHandler(behavior)}
      onKeyDown={buildRowKeyDownHandler(behavior)}
      onAuxClick={buildRowAuxClickHandler(behavior)}
      onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(item) : undefined}
    >
      {row.getVisibleCells().map((cell) => (
        <DataTableCell key={cell.id} cell={cell} cellPad={cellPad} borderCell={borderCell} />
      ))}
    </TableRow>
  );
}

/** La selección conserva semántica de fila; las otras acciones anuncian su destino. */
function getRowRole(navigable: boolean, seleccionable: boolean, hasCallback: boolean) {
  if (navigable) return "link";
  if (!seleccionable && hasCallback) return "button";
  return undefined;
}

interface RowClassArgs {
  clickable: boolean;
  striped: boolean;
  hoverable: boolean;
}

function rowClasses({ clickable, striped, hoverable }: RowClassArgs) {
  return cn(
    clickable && "cursor-pointer",
    clickable
      && "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    !striped && "even:bg-transparent",
    !hoverable && "hover:bg-transparent",
  );
}

function DataTableCell<T extends object>({
  cell, cellPad, borderCell,
}: {
  cell: Cell<T, unknown>;
  cellPad: string;
  borderCell: string;
}) {
  const meta = cell.column.columnDef.meta ?? {};
  const align: ColumnAlign = meta.align ?? "left";
  return (
    <TableCell
      className={cn(
        meta.width, cellPad, ALIGN_CLASS[align], borderCell, meta.className,
        meta.sticky && STICKY_LEFT,
        meta.stickyRight && STICKY_RIGHT,
      )}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </TableCell>
  );
}

