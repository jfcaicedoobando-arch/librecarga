import { Inbox } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Skeleton } from "@/components/ui/skeleton";
import type { useFacturasEntrantes } from "@/features/cxp/hooks";

interface Props {
  consulta: Pick<ReturnType<typeof useFacturasEntrantes>, "data" | "isError" | "isFetching" | "isLoading" | "refetch">;
}

export function EntrantesEstadoConsulta({ consulta }: Props) {
  if (consulta.isError) {
    return (
      <ErrorStateInline
        title="No se pudo cargar el buzón de facturas"
        message="Reintenta para consultar las facturas recibidas de este embarque."
        onRetry={() => void consulta.refetch()}
        retrying={consulta.isFetching}
      />
    );
  }
  if (consulta.isLoading) return <Skeleton className="h-24 w-full" />;
  if (consulta.data?.length !== 0) return null;
  return (
    <EmptyStateInline
      icon={Inbox}
      message="Aún no hay facturas de proveedor en el buzón de este embarque."
      className="py-6"
    />
  );
}
