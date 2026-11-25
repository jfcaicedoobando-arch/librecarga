import { ArrowUpRight, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CotizacionPlantilla } from "@/features/cotizacion/hooks/useCotizacionPlantillas";
import { formatDate } from "@/lib/formatters";

interface Acciones {
  onEditar: (p: CotizacionPlantilla) => void;
  onEliminar: (p: CotizacionPlantilla) => void;
  onUsar: (p: CotizacionPlantilla) => void;
}

interface Props extends Acciones {
  plantillas: CotizacionPlantilla[];
}

function Visibilidad({ plantilla }: { plantilla: CotizacionPlantilla }) {
  const deOrganizacion = plantilla.visibilidad === "org";
  return (
    <Badge variant={deOrganizacion ? "default" : "secondary"}>
      {deOrganizacion ? "Organización" : "Sólo yo"}
    </Badge>
  );
}

function MenuPlantilla({ plantilla, onEditar, onEliminar, onUsar }: Acciones & { plantilla: CotizacionPlantilla }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Acciones ${plantilla.nombre}`}>
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEditar(plantilla)}>
          <Pencil className="mr-2 size-4" aria-hidden /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onUsar(plantilla)}>
          <ArrowUpRight className="mr-2 size-4" aria-hidden /> Usar en cotización
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onEliminar(plantilla)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" aria-hidden /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlantillasTabla({ plantillas, ...acciones }: Props) {
  const columns = defineColumns<CotizacionPlantilla>([
    {
      accessorKey: "nombre", header: "Nombre", enableSorting: false,
      meta: { className: "font-medium" },
    },
    {
      id: "descripcion", header: "Descripción", enableSorting: false,
      cell: ({ row }) => <span className="block max-w-72 truncate">{row.original.descripcion ?? "—"}</span>,
      meta: { className: "text-muted-foreground" },
    },
    {
      id: "visibilidad", header: "Visibilidad", enableSorting: false,
      cell: ({ row }) => <Visibilidad plantilla={row.original} />,
    },
    {
      accessorKey: "veces_usada", header: "Usos", enableSorting: false,
      meta: { align: "right", className: "tabular-nums" },
    },
    {
      id: "updated_at", header: "Actualizada", enableSorting: false,
      cell: ({ row }) => formatDate(row.original.updated_at),
      meta: { className: "text-muted-foreground" },
    },
    {
      id: "actions", header: "", enableSorting: false, meta: { width: "w-12" },
      cell: ({ row }) => <MenuPlantilla plantilla={row.original} {...acciones} />,
    },
  ]);

  return (
    <ResponsiveDataTable
      columns={columns}
      data={plantillas}
      rowKey={(plantilla) => plantilla.id}
      density={TABLE_DENSITY.embebida}
      striped
      mobileCard={(plantilla) => (
        <article className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <h2 className="text-card-title wrap-anywhere">{plantilla.nombre}</h2>
              {plantilla.descripcion && (
                <p className="text-body-sm text-muted-foreground wrap-anywhere">{plantilla.descripcion}</p>
              )}
            </div>
            <MenuPlantilla plantilla={plantilla} {...acciones} />
          </div>
          <Visibilidad plantilla={plantilla} />
          <dl className="flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
            <div>
              <dt className="text-muted-foreground">Usos</dt>
              <dd className="tabular-nums">{plantilla.veces_usada}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actualizada</dt>
              <dd>{formatDate(plantilla.updated_at)}</dd>
            </div>
          </dl>
        </article>
      )}
    />
  );
}
