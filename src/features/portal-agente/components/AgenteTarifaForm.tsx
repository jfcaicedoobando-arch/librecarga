/**
 * Wrapper de TarifaForm para el portal del agente.
 * Inyecta `agenteIdFijo`, `agenteNombreFijo` y las rutas de la organización vinculada
 * (no usa OrganizationContext porque el usuario agente no es miembro del tenant).
 * El trigger en BD fuerza estado_aprobacion='borrador'.
 */
import { Tag } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { LoadingState } from "@/components/shared/states/LoadingState";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { TarifaForm } from "@/features/costeo/components/TarifaForm";
import { useAgenteContext } from "@/features/portal-agente/hooks";
import { useAgenteTarifaRutas } from "@/features/portal-agente/hooks/useAgenteTarifaRutas";
import type { TarifaInput } from "@/features/costeo/services/tarifas";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<TarifaInput>;
  tarifaId?: string;
  modo: "crear" | "editar" | "duplicar";
}

const TITULOS: Record<Props["modo"], string> = {
  crear: "Nueva tarifa (queda en borrador)",
  editar: "Editar tarifa (vuelve a borrador)",
  duplicar: "Duplicar tarifa (nueva versión en borrador)",
};

export function AgenteTarifaForm({ open, onOpenChange, initial, tarifaId, modo }: Props) {
  const contexto = useAgenteContext();
  const ctx = contexto.data;
  const catalogo = useAgenteTarifaRutas(ctx?.organizationId, open);
  const rutas = catalogo.data ?? [];

  if (!ctx) return (
    <FormDialogShell open={open} onOpenChange={onOpenChange} icon={Tag} title={TITULOS[modo]} footer={null}>
      <LoadingState
        label="Consultando tu agencia…"
        error={contexto.isError}
        errorLabel="No pudimos consultar tu agencia."
        onRetry={() => void contexto.refetch()}
      />
    </FormDialogShell>
  );

  let avisoRutas;
  if (catalogo.isError) {
    avisoRutas = <ErrorStateInline
      title="No pudimos consultar las rutas"
      message="Reintenta para recuperar el catálogo y continuar con la captura."
      onRetry={() => void catalogo.refetch()}
      retrying={catalogo.isFetching}
    />;
  } else if (catalogo.isLoading) {
    avisoRutas = <p role="status" className="text-sm text-muted-foreground">Consultando las rutas de tu agencia…</p>;
  } else if (!rutas.some((ruta) => ruta.activa)) {
    avisoRutas = <p className="text-sm text-muted-foreground">Solicita a Operaciones que habilite una ruta para tu agencia.</p>;
  }

  return (
    <TarifaForm
      open={open}
      onOpenChange={onOpenChange}
      // En duplicar pasamos initial pero SIN tarifaId → es un INSERT nuevo.
      initial={initial}
      tarifaId={modo === "duplicar" ? undefined : tarifaId}
      agenteIdFijo={ctx.agenteId}
      agenteNombreFijo={ctx.agenteNombre}
      tituloOverride={TITULOS[modo]}
      rutasOverride={rutas}
      avisoRutas={avisoRutas}
      organizationIdOverride={ctx.organizationId}
    />
  );
}
