/**
 * FacturapiOnboardingWizard — Asistente de 3 pasos para vincular la cuenta de
 * FacturApi de la org actual:
 *   1. Ambiente
 *   2. API keys (sandbox/live)
 *   3. Probar y confirmar
 *
 * Reusa hooks/servicios ya implementados (no toca backend).
 */
import { useEffect, useState } from "react";
import { Receipt, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  useFacturapiCredenciales,
  useUpsertFacturapiCredenciales,
} from "@/features/configuracion/hooks/useFacturapiCredenciales";
import type { FacturapiAmbiente } from "@/features/configuracion/services/facturapiCredenciales";
import { PasoAmbiente } from "./wizard/PasoAmbiente";
import { PasoApiKeys } from "./wizard/PasoApiKeys";
import { PasoProbar } from "./wizard/PasoProbar";
import { usePruebaFacturapiAmbiente } from "./wizard/usePruebaFacturapiAmbiente";

const PASOS = ["Ambiente", "API keys", "Probar"] as const;

interface Props {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FacturapiOnboardingWizard({ orgId, open, onOpenChange }: Props) {
  const { data } = useFacturapiCredenciales(orgId);
  const upsert = useUpsertFacturapiCredenciales(orgId);
  const [paso, setPaso] = useState(1);
  const [ambiente, setAmbiente] = useState<FacturapiAmbiente>("sandbox");

  // Hidratar ambiente desde la fila al abrir.
  useEffect(() => {
    if (!open) return;
    setPaso(1);
    setAmbiente((data?.ambiente as FacturapiAmbiente) ?? "sandbox");
  }, [open, orgId, data?.ambiente]);

  const sandboxLast4 = data?.api_key_sandbox_last4 ?? null;
  const liveLast4 = data?.api_key_live_last4 ?? null;
  const llaveActiva = ambiente === "sandbox" ? sandboxLast4 : liveLast4;
  const { resultado, probando, aprobada, onProbar } = usePruebaFacturapiAmbiente(orgId, ambiente, llaveActiva, open);
  const puedeFinalizar = aprobada && !upsert.isPending;

  const onFinalizar = async () => {
    if (!puedeFinalizar) return;
    await upsert.mutateAsync({
      ambiente,
      facturapi_org_id:
        resultado?.facturapi_org_id ?? data?.facturapi_org_id ?? null,
      datos_fiscales_completos: data?.datos_fiscales_completos ?? false,
      certificado_cargado: data?.certificado_cargado ?? false,
      certificado_vence_at: data?.certificado_vence_at ?? null,
    });
    notifySuccess(undefined, {
      title: `FacturApi conectado en ${ambiente === "live" ? "Producción" : "Sandbox"}`,
    });
    onOpenChange(false);
  };

  const puedeAvanzar = paso === 1 || !!llaveActiva;

  const footer = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setPaso((p) => Math.max(1, p - 1))}
        disabled={paso === 1 || upsert.isPending}
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
      </Button>
      {paso < 3 ? (
        <Button type="button" onClick={() => setPaso((p) => p + 1)} disabled={!puedeAvanzar}>
          Siguiente <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button type="button" onClick={onFinalizar} disabled={!puedeFinalizar}>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {upsert.isPending ? "Guardando…" : "Finalizar"}
        </Button>
      )}
    </>
  );

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={upsert.isPending}
      icon={Receipt}
      title="Conectar FacturApi"
      description="Vincula tu cuenta de FacturApi en 3 pasos para empezar a timbrar CFDI 4.0."
      size="lg"
      stepper={{ step: paso, totalSteps: PASOS.length, labels: [...PASOS] }}
      footer={footer}
    >
      {paso === 1 && (
        <FormDialogSection flat title="Paso 1 · Ambiente">
          <PasoAmbiente ambiente={ambiente} onChange={setAmbiente} />
        </FormDialogSection>
      )}
      {paso === 2 && (
        <FormDialogSection flat title="Paso 2 · API keys">
          <PasoApiKeys
            orgId={orgId}
            ambiente={ambiente}
            sandboxLast4={sandboxLast4}
            liveLast4={liveLast4}
          />
        </FormDialogSection>
      )}
      {paso === 3 && (
        <FormDialogSection flat title="Paso 3 · Probar conexión">
          <PasoProbar
            ambiente={ambiente}
            resultado={resultado}
            probando={probando}
            onProbar={onProbar}
          />
        </FormDialogSection>
      )}
    </FormDialogShell>
  );
}
