import { MapPinned } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/contexts/AuthContext";
import { hasRouteAccess } from "@/lib/access/roleRouteMatrix";
import { Card } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { LoadingState } from "@/components/shared/states/LoadingState";
import type { usePuertosDeRutas } from "@/features/costeo/hooks/usePuertosDeRutas";

type EstadoFuentes = Pick<ReturnType<typeof usePuertosDeRutas>,
  "isLoading" | "isError" | "isRetrying" | "actualizando" | "sinRutas" | "reintentar">;

/** El vacío sólo se presenta después de resolver ambas fuentes sin errores. */
export function CosteoBuscarFuentes({ estado }: { estado: EstadoFuentes }) {
  const { effectiveRole } = useAuth();
  const puedeAbrirRutas = hasRouteAccess(effectiveRole, "/costeo/rutas");
  if (estado.isError) {
    return (
      <Card>
        <ErrorStateInline
          title="No pudimos cargar las rutas disponibles"
          message="Falló la consulta de rutas o del catálogo de puertos. Reintenta para validar los puertos disponibles."
          onRetry={() => void estado.reintentar()}
          retrying={estado.isRetrying}
        />
      </Card>
    );
  }
  if (estado.isLoading) {
    return (
      <Card>
        <LoadingState label="Cargando rutas y catálogo de puertos…" minHeight="min-h-24" />
      </Card>
    );
  }
  if (estado.actualizando) {
    return (
      <Card role="status">
        <EmptyStateInline loading density="compact" message="Actualizando rutas y catálogo de puertos…" />
      </Card>
    );
  }
  if (estado.sinRutas) {
    return (
      <Card className="p-4" role="status">
        <EmptyStateInline
          icon={MapPinned}
          message="Aún no hay rutas marítimas dadas de alta."
          hint={puedeAbrirRutas ? undefined : "Pide a alguien con acceso a Costeo que registre la ruta."}
        />
        {puedeAbrirRutas && <div className="text-center">
          <Button asChild variant="outline" size="sm"><Link to="/costeo/rutas">Abrir rutas de Costeo</Link></Button>
        </div>}
      </Card>
    );
  }
  return null;
}
