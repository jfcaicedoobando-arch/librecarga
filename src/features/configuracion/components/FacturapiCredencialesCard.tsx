/**
 * Tarjeta de configuración de FacturApi por organización (multi-tenant v13.136.x).
 *
 * Esta UI NO captura la API key real. La key se guarda como secret en
 * Lovable Cloud (Backend → Secrets) con el nombre que esta tarjeta sugiere
 * (ej. `FACTURAPI_KEY_ACME_SANDBOX`). Aquí sólo se persiste el ambiente
 * activo, el nombre del secret y metadatos (org id en FacturApi, estado del CSD).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useCopyText } from "@/hooks/shared";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import {
  useFacturapiCredenciales,
  useUpsertFacturapiCredenciales,
} from "@/features/configuracion/hooks/useFacturapiCredenciales";
import { type FacturapiAmbiente } from "@/features/configuracion/services/facturapiCredenciales";
import FacturapiCredencialesForm from "./FacturapiCredencialesForm";
import { FacturapiWebhookUrlSection } from "./FacturapiWebhookUrlSection";
import FacturapiOnboardingWizard from "./FacturapiOnboardingWizard";
import { AccesoAsistenteFacturapi, EstadoLecturaCredenciales, HeaderBadges } from "./FacturapiCredencialesCard.parts";

const NOMBRE_AMBIENTE = { sandbox: "Sandbox", live: "Producción" } satisfies Record<FacturapiAmbiente, string>;

function GuardarConfiguracionFacturapi({ ambiente, guardado, busy, onGuardar }: {
  ambiente: FacturapiAmbiente; guardado: FacturapiAmbiente; busy: boolean; onGuardar: () => void;
}) {
  const cambia = ambiente !== guardado;
  return (
    <>
      {cambia && (
        <p role="status" className="text-body-sm text-muted-foreground">
          Ambiente activo: {NOMBRE_AMBIENTE[guardado]}. Cambiará a {NOMBRE_AMBIENTE[ambiente]} al guardar.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" onClick={onGuardar} disabled={busy} variant="outline" size="sm">
          {busy ? "Guardando…" : cambia ? `Activar ${NOMBRE_AMBIENTE[ambiente]}` : "Guardar configuración"}
        </Button>
      </div>
    </>
  );
}

export default function FacturapiCredencialesCard() {
  const { organization } = useOrganization();
  const copy = useCopyText();
  const orgId = organization?.id ?? null;
  const { data, isLoading, isError, isFetching, refetch } = useFacturapiCredenciales(orgId);
  const upsert = useUpsertFacturapiCredenciales(orgId);

  const [ambiente, setAmbiente] = useState<FacturapiAmbiente>("sandbox");
  const [facturapiOrgId, setFacturapiOrgId] = useState("");
  const [datosFiscales, setDatosFiscales] = useState(false);
  const [csdCargado, setCsdCargado] = useState(false);
  const [csdVence, setCsdVence] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setAmbiente((data?.ambiente as FacturapiAmbiente) ?? "sandbox");
    setFacturapiOrgId(data?.facturapi_org_id ?? "");
    setDatosFiscales(data?.datos_fiscales_completos ?? false);
    setCsdCargado(data?.certificado_cargado ?? false);
    setCsdVence(data?.certificado_vence_at ?? "");
  }, [data, orgId]);

  if (!orgId) return null;

  const copiar = (texto: string) => {
    void copy(texto, { errorTitle: "No se pudo copiar", method: "FacturapiCredencialesCard.copiar" });
  };

  const onGuardar = async () => {
    try {
      await upsert.mutateAsync({
        ambiente,
        facturapi_org_id: facturapiOrgId.trim() || null,
        datos_fiscales_completos: datosFiscales,
        certificado_cargado: csdCargado,
        certificado_vence_at: csdVence || null,
      });
      notifySuccess(undefined, { title: "Configuración de FacturApi guardada" });
    } catch (err) {
      notifyError(undefined, { title: "No se pudo guardar la configuración", method: "FacturapiCredencialesCard.onGuardar", error: err });
    }
  };

  const {
    api_key_sandbox_last4: sandboxLast4 = null,
    api_key_live_last4: liveLast4 = null,
    ambiente: ambienteGuardado = "sandbox",
  } = data ?? {};
  const configurado = ambienteGuardado === "sandbox" ? !!sandboxLast4 : !!liveLast4;

  if (isLoading || isError) {
    return <EstadoLecturaCredenciales error={isError} ultimoAmbiente={data?.ambiente}
      reintentar={() => void refetch()} reintentando={isFetching} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" /> FacturApi (Timbrado SAT)
          <HeaderBadges configurado={configurado} ambiente={ambienteGuardado} />
        </CardTitle>
        <CardDescription>
          Conecta tu cuenta de FacturApi para timbrar CFDI 4.0 desde Libre Carga.
          Pega abajo tus API keys de Sandbox y Producción; se guardan cifradas
          en el servidor y nunca regresan al navegador.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <AccesoAsistenteFacturapi configurado={configurado} abrir={() => setWizardOpen(true)} />

        <details className="rounded border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30">
            Modo avanzado — editar campos manualmente
          </summary>
          <div className="p-3 space-y-4">
            <FacturapiCredencialesForm
              orgId={orgId}
              ambiente={ambiente}
              setAmbiente={setAmbiente}
              facturapiOrgId={facturapiOrgId}
              setFacturapiOrgId={setFacturapiOrgId}
              sandboxLast4={sandboxLast4}
              liveLast4={liveLast4}
              datosFiscales={datosFiscales}
              setDatosFiscales={setDatosFiscales}
              csdCargado={csdCargado}
              setCsdCargado={setCsdCargado}
              csdVence={csdVence}
              setCsdVence={setCsdVence}
            />
            <GuardarConfiguracionFacturapi ambiente={ambiente} guardado={ambienteGuardado}
              busy={upsert.isPending} onGuardar={onGuardar} />
          </div>
        </details>

        <FacturapiWebhookUrlSection orgId={orgId} copiar={copiar} cred={data ?? null} />



        <FacturapiOnboardingWizard
          orgId={orgId}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
        />
      </CardContent>
    </Card>
  );
}

