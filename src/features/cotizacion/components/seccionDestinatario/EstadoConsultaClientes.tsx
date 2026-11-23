import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { usePermissions } from "@/hooks/shared/usePermissions";

export interface EstadoCatalogoClientes {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

export function EstadoConsultaClientes({ consulta, hayClientes }: {
  consulta: EstadoCatalogoClientes;
  hayClientes: boolean;
}) {
  const { canAltaCliente } = usePermissions();
  if (consulta.isLoading && !hayClientes) {
    return <div role="status"><EmptyStateInline loading density="compact" message="Cargando clientes…" /></div>;
  }
  if (consulta.isError) {
    return (
      <ErrorStateInline
        title="No pudimos consultar los clientes"
        message={hayClientes ? "Mostramos los últimos clientes consultados." : "Reintenta para elegir al destinatario."}
        onRetry={() => void consulta.refetch()}
        retrying={consulta.isFetching}
      />
    );
  }
  if (hayClientes) return null;
  return (
    <EmptyStateInline density="compact" message="No hay clientes disponibles.">
      {canAltaCliente && (
        <Button size="sm" variant="outline" asChild>
          <Link to="/clientes?nuevo=1" target="_blank" rel="noopener">Crear cliente en otra pestaña</Link>
        </Button>
      )}
    </EmptyStateInline>
  );
}
