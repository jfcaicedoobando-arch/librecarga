import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { LoadingState } from "@/components/shared/states/LoadingState";
import type { useDemorasTramos } from "@/features/costeo/hooks/useNavieraCondiciones";

interface Props {
  consulta: Pick<ReturnType<typeof useDemorasTramos>, "isError" | "isFetching" | "refetch">;
}

export function DemorasTarifaEstadoConsulta({ consulta }: Props) {
  if (!consulta.isError) {
    return <LoadingState label="Cargando tabulador de demoras…" minHeight="min-h-24" />;
  }
  return (
    <ErrorStateInline
      title="No se pudo cargar el tabulador"
      message="Reintenta para consultar los tramos antes de editar o guardar."
      onRetry={() => void consulta.refetch()}
      retrying={consulta.isFetching}
    />
  );
}
