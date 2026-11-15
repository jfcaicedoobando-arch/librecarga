import { PageContainer } from "@/components/shared/PageContainer";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { useDirtyGuard } from "@/hooks/shared/useDirtyGuard";

/** Conserva la protección de salida cuando un error reemplaza el wizard. */
export function EditarEmbarqueError({ description, onRetry, isDirty }: {
  description?: string;
  onRetry: () => void;
  isDirty: boolean;
}) {
  const { guardDialog } = useDirtyGuard(isDirty);
  return (
    <PageContainer>
      {guardDialog}
      <ErrorState description={description} onRetry={onRetry} />
    </PageContainer>
  );
}
