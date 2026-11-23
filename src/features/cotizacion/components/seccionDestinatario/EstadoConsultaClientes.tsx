import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
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
    return <p role="status" className="text-body-sm text-muted-foreground">Cargando clientes…</p>;
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
    <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
      No hay clientes disponibles.
      {canAltaCliente && (
        <Button size="sm" variant="outline" asChild>
          <Link to="/clientes?nuevo=1" target="_blank" rel="noopener">Crear cliente en otra pestaña</Link>
        </Button>
      )}
    </div>
  );
}
