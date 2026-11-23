/**
 * CatalogoClavesSATCard — Catálogo maestro de productos y servicios por org.
 *
 * Fuente única de verdad para:
 *   - Determinar la clave SAT y el tipo de IVA de cada renglón al facturar.
 *   - Restringir qué productos/servicios pueden capturarse en cotizaciones
 *     (modo estricto: sólo productos del catálogo).
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useCatalogoClavesSATController } from "@/features/configuracion/hooks/useCatalogoClavesSATController";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { DetailTableRow } from "@/components/shared/DetailTable";
import DoubleConfirmDeleteDialog from "@/components/shared/DoubleConfirmDeleteDialog";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { CatalogoClavesSATTabla, EditRow } from "./CatalogoClavesSATCard.parts";
import {
  EMPTY_DRAFT, TIPO_IVA_LABEL, TIPO_IVA_BADGE, TIPO_IVA_VARIANT,
  type Draft, type Row,
} from "./CatalogoClavesSATCard.constants";

function estadoTabla(cargando: boolean, total: number, visibles: number, agregando: boolean) {
  if (cargando) return "cargando";
  if (total === 0 && !agregando) return "vacio";
  if (total > 0 && visibles === 0) return "sin-coincidencias";
  return "disponible";
}

function BusquedaProductos({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <SearchInput value={valor} onChange={onChange} placeholder="Buscar por nombre o clave SAT…" />
      {valor && <Button variant="ghost" size="sm" onClick={() => onChange("")}>Limpiar búsqueda</Button>}
    </div>
  );
}

export function CatalogoClavesSATCard() {
  const { rows, isLoading, isError, isFetching, refetch, addMut, updateMut, deleteMut } = useCatalogoClavesSATController();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showNew, setShowNew] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const filtro = busqueda.trim().toLocaleLowerCase("es-MX");
  const filasVisibles = rows.filter((r) =>
    r.id === editingId || `${r.patron} ${r.clave_sat}`.toLocaleLowerCase("es-MX").includes(filtro),
  );
  // UX-01: eliminar exige confirmación de doble paso.
  const [rowAEliminar, setRowAEliminar] = useState<Row | null>(null);

  const busy = addMut.isPending || updateMut.isPending || deleteMut.isPending;

  const editando = editingId !== null || showNew;

  const startEdit = (r: Row) => {
    if (editando || busy) return;
    setEditingId(r.id);
    setDraft({
      patron: r.patron, clave_sat: r.clave_sat,
      activo: r.activo,
      tipo_iva: r.tipo_iva, clave_unidad_sat: r.clave_unidad_sat,
    });
  };

  const validDraft = useMemo(
    () => draft.patron.trim().length > 0 && draft.clave_sat.trim().length >= 6 && draft.clave_unidad_sat.trim().length > 0,
    [draft],
  );

  const handleAdd = () => {
    addMut.mutate(draft, { onSuccess: () => { setShowNew(false); setDraft(EMPTY_DRAFT); } });
  };

  const handleUpdate = () => {
    updateMut.mutate({ id: editingId as string, d: draft }, { onSuccess: () => setEditingId(null) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Catálogo de productos y servicios</CardTitle>
          <CardDescription>
            Da de alta cada producto/servicio que tu empresa vende. Cada uno lleva su clave SAT,
            tipo de IVA y unidad. Las cotizaciones sólo permiten elegir productos de este catálogo,
            y al facturar se usa esta información automáticamente.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setShowNew(true); setDraft(EMPTY_DRAFT); }} disabled={editando || busy || isLoading || isError}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo producto
        </Button>
      </CardHeader>
      <CardContent>
        {editando && <p role="status" className="mb-3 text-body-sm text-muted-foreground">Guarda o cancela el producto en edición antes de abrir otro.</p>}
        {isError && <ErrorStateInline title="No se pudo cargar el catálogo de productos" message="Reintenta antes de agregar o editar productos." onRetry={() => void refetch()} retrying={isFetching} />}
        {!isLoading && !isError && rows.length > 0 && (
          <BusquedaProductos valor={busqueda} onChange={setBusqueda} />
        )}
        <CatalogoClavesSATTabla estado={estadoTabla(isLoading, rows.length, filasVisibles.length, showNew)} ocultar={isError}>
          {filasVisibles.map((r) => editingId === r.id ? (
            <EditRow key={r.id} draft={draft} setDraft={setDraft} busy={busy} valid={validDraft}
                     tipoIvaOriginal={r.tipo_iva}
                     onCancel={() => setEditingId(null)}
                     onSave={handleUpdate} />
          ) : (
            <DetailTableRow key={r.id}>
              <TableCell className="font-medium">{r.patron}</TableCell>
              <TableCell className="font-mono text-xs">{r.clave_sat}</TableCell>
              <TableCell>
                <Badge variant={TIPO_IVA_VARIANT[r.tipo_iva]} aria-label={TIPO_IVA_LABEL[r.tipo_iva]}>
                  {TIPO_IVA_BADGE[r.tipo_iva]}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{r.clave_unidad_sat}</TableCell>
              <TableCell>{r.activo ? "Sí" : "No"}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => startEdit(r)} disabled={editando || busy} aria-label={`Editar producto ${r.patron}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setRowAEliminar(r)} disabled={editando || busy} aria-label={`Eliminar producto ${r.patron}`}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </DetailTableRow>
          ))}
          {showNew && (
            <EditRow draft={draft} setDraft={setDraft} busy={busy} valid={validDraft}
                     onCancel={() => { setShowNew(false); setDraft(EMPTY_DRAFT); }}
                     onSave={handleAdd} />
          )}
        </CatalogoClavesSATTabla>
      </CardContent>
      <DoubleConfirmDeleteDialog
        open={!!rowAEliminar}
        onOpenChange={(open) => { if (!open) setRowAEliminar(null); }}
        entityName={rowAEliminar ? `el producto "${rowAEliminar.patron}"` : "este producto"}
        description="El producto dejará de estar disponible para nuevas cotizaciones y facturas."
        isPending={deleteMut.isPending}
        onConfirm={() => {
          if (rowAEliminar) deleteMut.mutate(rowAEliminar.id);
        }}
      />
    </Card>
  );
}
