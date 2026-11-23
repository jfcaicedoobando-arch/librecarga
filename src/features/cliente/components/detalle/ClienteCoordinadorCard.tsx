import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useAuth } from "@/lib/contexts/AuthContext";
import { CoordinadorSelect } from "@/components/shared/CoordinadorSelect";
import { puedeAsignarCoordinador } from "@/lib/access/coordinadorAsignacion";
import { useClienteCoordinador } from "@/features/cliente/hooks/useClienteCoordinador";

/** Coordinador fijo del cliente: lo usan los handovers de clientes generales. */
export function ClienteCoordinadorCard({ clienteId, tipoCliente }: { clienteId: string; tipoCliente: string }) {
  const { effectiveRole } = useAuth();
  const { query, guardar } = useClienteCoordinador(clienteId);
  if (tipoCliente === "especial") {
    return (
      <p className="text-body-sm text-muted-foreground border rounded-md p-3">
        Cliente especial: cada operación la atiende quien crea la cotización.
      </p>
    );
  }
  if (query.isLoading) return <EmptyStateInline loading message="Cargando coordinador del cliente…" />;
  if (query.isError) return (
    <ErrorStateInline title="No se pudo consultar el coordinador" message="Reintenta para saber quién atiende los handovers."
      onRetry={() => void query.refetch()} retrying={query.isFetching} />
  );
  return (
    <dl className="border rounded-md p-3 max-w-sm text-body">
      <CoordinadorSelect
        label="Coordinador logístico del cliente"
        value={query.data ?? null}
        editable={puedeAsignarCoordinador(effectiveRole)}
        permitirVacio
        soloCoordinadores
        onGuardar={guardar}
        onGuardado={() => void query.refetch()}
      />
    </dl>
  );
}
