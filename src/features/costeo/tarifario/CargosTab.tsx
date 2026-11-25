/** Vistas 2 y 3 del tarifario: cargos FOB de agentes / cargos locales por naviera. */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Pencil, Plus, Trash2 } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { costeo } from "../queryKeys";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { exportToCsv } from "@/generators/exportCsv";
import { formatCurrency } from "@/lib/formatters/numbers";
import { useTasaIVA } from "@/features/catalogos/hooks/useTasaIVA";
import { montoConIva } from "./ivaCargo";
import { archivarCargo, listarCargos, type CargoTarifario, type TipoCargo } from "./cargosService";
import { CargoFormDialog } from "./CargoFormDialog";
import { DescargarTarifarioButton } from "./DescargarTarifarioButton";
import { OrdenTarifarioMenu } from "./OrdenTarifarioMenu";
import { useOrdenTarifarioMovil } from "./useOrdenTarifarioMovil";

interface Props { tipo: TipoCargo; orgId: string | null; puedeEditar: boolean }

function CargoTarifarioCard({ cargo, entidad, tasaIva, acciones }: {
  cargo: CargoTarifario; entidad: string; tasaIva: number; acciones?: ReactNode;
}) {
  return (
    <article className="space-y-2">
      <p className="text-body font-semibold break-words">{cargo.concepto}</p>
      <p className="text-body-sm text-muted-foreground break-words">{entidad}: {cargo.entidad?.nombre ?? "—"}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm">
        <div>
          <dt className="text-label text-muted-foreground">Monto</dt>
          <dd className="break-words tabular-nums">{formatCurrency(cargo.monto, cargo.moneda)}</dd>
        </div>
        <div>
          <dt className="text-label text-muted-foreground">Monto con IVA</dt>
          <dd className="break-words tabular-nums">
            {cargo.aplica_iva ? formatCurrency(montoConIva(cargo.monto, true, tasaIva), cargo.moneda) : "No aplica"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-label text-muted-foreground">Unidad</dt>
          <dd className="break-words">{cargo.unidad ?? "—"}</dd>
        </div>
      </dl>
      {acciones && <div className="flex justify-end gap-2">{acciones}</div>}
    </article>
  );
}

export function CargosTab({ tipo, orgId, puedeEditar }: Props) {
  const q = useQuery({ queryKey: costeo.tarifario.cargos(tipo), queryFn: () => listarCargos(tipo) });
  const [editando, setEditando] = useState<CargoTarifario | null | "nuevo">(null);
  const [cargoARetirar, setCargoARetirar] = useState<CargoTarifario | null>(null);
  const [retirando, setRetirando] = useState(false);
  const tasaIva = useTasaIVA();
  const etiqueta = tipo === "fob" ? "Agente" : "Naviera";
  const filas = q.data ?? [];

  const descargar = () => exportToCsv(`${tipo === "fob" ? "cargos-fob" : "cargos-locales"}.csv`,
    [{ key: "e", label: etiqueta }, { key: "c", label: "Concepto" }, { key: "m", label: "Monto" }, { key: "cur", label: "Moneda" }, { key: "u", label: "Unidad" }, { key: "iva", label: "Aplica IVA" }, { key: "t", label: "Monto con IVA" }],
    filas.map((c) => ({ e: c.entidad?.nombre ?? "", c: c.concepto, m: c.monto, cur: c.moneda, u: c.unidad ?? "", iva: c.aplica_iva ? "Sí" : "No", t: montoConIva(c.monto, c.aplica_iva, tasaIva) })));

  const archivar = async () => {
    if (!puedeEditar || !cargoARetirar || retirando) return;
    setRetirando(true);
    try {
      await archivarCargo(tipo, cargoARetirar.id);
      notifySuccess(undefined, { title: "Cargo retirado" });
      setCargoARetirar(null);
      void q.refetch();
    } catch (error) {
      notifyError(undefined, { title: "No se pudo retirar el cargo.", error, method: "archivarCargo" });
    } finally {
      setRetirando(false);
    }
  };

  const acciones = (cargo: CargoTarifario) => (
    <>
      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditando(cargo)}><Pencil className="size-4" /></Button>
      <Button size="icon" variant="ghost" aria-label="Retirar" onClick={() => setCargoARetirar(cargo)}><Trash2 className="size-4" /></Button>
    </>
  );

  const columns = defineColumns<CargoTarifario>([
    { id: "entidad", header: etiqueta, accessorFn: (c) => c.entidad?.nombre ?? "—" },
    { accessorKey: "concepto", header: "Concepto" },
    { accessorKey: "monto", header: "Monto", cell: ({ row }) => formatCurrency(row.original.monto, row.original.moneda) },
    { id: "con_iva", header: "Monto con IVA", cell: ({ row }) => row.original.aplica_iva
      ? formatCurrency(montoConIva(row.original.monto, true, tasaIva), row.original.moneda) : "No aplica" },
    { accessorKey: "moneda", header: "Moneda" },
    { id: "unidad", header: "Unidad", accessorFn: (c) => c.unidad ?? "—" },
    ...(puedeEditar ? [{ id: "acciones", header: "Acciones", cell: ({ row }: { row: { original: CargoTarifario } }) => acciones(row.original) }] : []),
  ]);
  const { movil, tabla, data } = useOrdenTarifarioMovil(filas, columns);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-end gap-2">
        {movil && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" type="button" aria-label="Ordenar cargos"><ArrowDownUp aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end"><OrdenTarifarioMenu tabla={tabla} /></DropdownMenuContent>
          </DropdownMenu>
        )}
        <DescargarTarifarioButton cargando={q.isFetching} error={q.isError} hayFilas={filas.length > 0}
          onDownload={descargar} />
        {puedeEditar && orgId && <Button onClick={() => setEditando("nuevo")}><Plus className="mr-1 size-4" /> Nuevo cargo</Button>}
      </div>
      <ResponsiveDataTable columns={columns} data={data} rowKey={(c) => c.id} isLoading={q.isLoading}
        mobileCard={(cargo) => <CargoTarifarioCard cargo={cargo} entidad={etiqueta} tasaIva={tasaIva} acciones={puedeEditar ? acciones(cargo) : undefined} />}
        density={TABLE_DENSITY.listado}
        isError={q.isError} onRetry={() => { void q.refetch(); }} emptyMessage="Sin cargos capturados." />
      {puedeEditar && cargoARetirar && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => { if (!open && !retirando) setCargoARetirar(null); }}
          title="¿Retirar este cargo del tarifario?"
          description={`El cargo «${cargoARetirar.concepto}» dejará de aparecer en el tarifario. ${etiqueta}: ${cargoARetirar.entidad?.nombre ?? "sin nombre registrado"}.`}
          confirmLabel="Retirar cargo"
          variant="destructive"
          isPending={retirando}
          onConfirm={archivar}
        />
      )}
      {editando && orgId && (
        <CargoFormDialog tipo={tipo} orgId={orgId} cargo={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)} onSaved={() => { void q.refetch(); }} />
      )}
    </div>
  );
}
