/**
 * Curva de flujo proyectado embebida en el dashboard de Tesorería (12 semanas)
 * con enlace a la vista completa de 90 días.
 */
import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { getErrorMessage } from "@/lib/errors";
import { useFlujoProyectado } from "@/features/tesoreria/hooks";
import { ROUTES } from "@/constants/routes";

const GraficoFlujoProyectado = lazy(
  () => import("@/features/tesoreria/components/GraficoFlujoProyectado"),
);

export function TesoreriaFlujoChart() {
  const { data, isLoading, error, refetch } = useFlujoProyectado(90);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Flujo de caja proyectado</CardTitle>
          <Link
            to={ROUTES.TESORERIA_FLUJO}
            className="inline-flex items-center gap-1 text-body-sm text-accent hover:underline"
          >
            Ver 90 días <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorStateInline message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <ChartSkeleton />
        ) : (
          <Suspense fallback={<ChartSkeleton />}>
            <GraficoFlujoProyectado semanas={data.semanas} saldoDisponible={data.saldo_inicial_disponible} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}
