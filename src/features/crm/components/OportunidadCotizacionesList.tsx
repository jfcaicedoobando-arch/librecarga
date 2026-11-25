import { Link } from "react-router";
import { ClipboardList, Ship } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defineColumns } from "@/components/shared/DataTable";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { formatCurrencyCompact } from "@/lib/formatters";
import { useOportunidadCotizaciones } from "@/features/crm/hooks";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { diffDiasMx } from "@/lib/date/mx";
import type { OportunidadCotizacionRow } from "@/features/crm/services/oportunidadCotizaciones";

function EstadoCotizacion({ cotizacion }: { cotizacion: OportunidadCotizacionRow }) {
  // Se cuenta desde el envío real, en el calendario de negocio.
  const diasEnviada = cotizacion.estado === "Enviada" && cotizacion.fecha_envio
    ? (diffDiasMx(cotizacion.fecha_envio, new Date()) ?? 0)
    : 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{cotizacion.estado}</Badge>
      {diasEnviada > 5 && (
        <Badge variant="destructive" className="text-label">Sin respuesta · {diasEnviada}d</Badge>
      )}
    </div>
  );
}

function EnlaceEmbarque({ cotizacion }: { cotizacion: OportunidadCotizacionRow }) {
  if (!cotizacion.embarque_id) return <span className="text-muted-foreground">—</span>;
  return (
    <Button variant="link" size="sm" className="h-auto p-0 inline-flex items-center gap-1" asChild>
      <Link to={`/embarques/${cotizacion.embarque_id}`} aria-label={`Ver embarque de ${cotizacion.folio}`}>
        <Ship className="h-3 w-3" aria-hidden /> Ver
      </Link>
    </Button>
  );
}

const monto = (c: OportunidadCotizacionRow) => formatCurrencyCompact(Number(c.subtotal ?? 0), c.moneda);

const columns = defineColumns<OportunidadCotizacionRow>([
  { id: "folio", header: "Folio", meta: { className: "font-medium" }, cell: ({ row }) => row.original.folio },
  { id: "estado", header: "Estado", cell: ({ row }) => <EstadoCotizacion cotizacion={row.original} /> },
  { id: "monto", header: "Monto", meta: { align: "right" }, cell: ({ row }) => monto(row.original) },
  { id: "embarque", header: "Embarque", meta: { align: "center" }, cell: ({ row }) => <EnlaceEmbarque cotizacion={row.original} /> },
]);

export default function OportunidadCotizacionesList({ oportunidadId }: { oportunidadId: string }) {
  const { data = [], isLoading } = useOportunidadCotizaciones(oportunidadId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Cotizaciones vinculadas ({data.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <EmptyStateInline loading message="Cargando…" />
        ) : (
          <ResponsiveDataTable
            columns={columns}
            data={data}
            density={TABLE_DENSITY.embebida}
            rowKey={(c) => c.id}
            getRowHref={(c) => `/cotizaciones/${c.id}`}
            getRowAriaLabel={(c) => `Abrir cotización ${c.folio}`}
            emptyState={
              <EmptyStateInline
                icon={ClipboardList}
                message="Aún no se ha creado ninguna cotización para esta oportunidad."
                hint='Usa el botón "Nueva cotización" arriba.'
              />
            }
            mobileCard={(c) => (
              <>
                <span className="font-medium">{c.folio}</span>
                <MobileRowDetails fields={[
                  { label: "Estado", value: <EstadoCotizacion cotizacion={c} /> },
                  { label: "Monto", value: monto(c) },
                  { label: "Embarque", value: <EnlaceEmbarque cotizacion={c} /> },
                ]} />
              </>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
