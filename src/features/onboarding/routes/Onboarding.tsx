/**
 * Onboarding inicial post-registro. Captura RFC, dirección y moneda
 * preferida de la agencia recién creada antes de entrar a /inicio.
 * Sólo accesible para admins de organización cuyo onboarding no ha sido
 * completado. Si ya lo completaron, redirige a /inicio.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";
import { Seo } from "@/components/shared/Seo";
import { completeOnboarding } from "@/features/onboarding/services/completeOnboarding";
import { OnboardingForm, type OnboardingFormProps } from "@/features/onboarding/components/OnboardingForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons/PageSkeleton";
import { useToast } from "@/hooks/shared";
import { notifyError } from "@/lib/ui/appFeedback";
import { ROUTES } from "@/constants/routes";
import { validateOnboarding } from "@/features/onboarding/lib/onboardingValidation";
import { getErrorMessage } from "@/lib/errors";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";

export default function Onboarding() {
  const { user, organization, loading, refreshProfile } = useAuth();
  // A2: la organización activa (soporta super admin con tenant seleccionado).
  const { organizationId } = useOrgActiva();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rfc, setRfc] = useState(organization?.rfc ?? "");
  const [direccion, setDireccion] = useState(organization?.direccion ?? "");
  const [moneda, setMoneda] = useState<string>(organization?.moneda_preferida ?? "MXN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarOmitir, setConfirmarOmitir] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [campoError, setCampoError] = useState<OnboardingFormProps["campoError"]>();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        {/* UI-07: skeleton en lugar de spinner de página. */}
        <PageSkeleton className="w-full max-w-3xl" />
      </div>
    );
  }
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  if (organization?.onboarding_completado) return <Navigate to={ROUTES.INICIO} replace />;

  const submit = async (opts: { skipFiscal: boolean }) => {
    setError(null);
    setCampoError(undefined);
    const v = validateOnboarding({ rfc, direccion, moneda, skipFiscal: opts.skipFiscal });
    if (!v.ok) {
      setError(v.message);
      setCampoError(v.field);
      document.getElementById(`onb-${v.field}`)?.focus();
      return;
    }
    // Ola 4 · N30: sin org activa no hay onboarding que guardar.
    if (!organizationId) {
      setError("No pudimos determinar tu organización. Recarga la página e inténtalo de nuevo.");
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding({ organizationId, rfc: v.rfc, direccion: v.direccion, moneda: v.moneda });
      await refreshProfile();
      toast({
        title: opts.skipFiscal ? "¡Bienvenido!" : "¡Listo!",
        description: opts.skipFiscal
          ? "Puedes completar tus datos fiscales después en Configuración."
          : "Configuración inicial completada.",
      });
      navigate(ROUTES.INICIO, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      notifyError(undefined, {
        title: "Error al completar onboarding",
        description: msg,
        error: err,
        method: "COMPLETE_ONBOARDING",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit({ skipFiscal: false });
  };

  const reintentar = async () => {
    setReintentando(true);
    setError(null);
    try {
      await refreshProfile();
    } catch {
      setError("No pudimos actualizar tu acceso. Inténtalo de nuevo.");
    } finally {
      setReintentando(false);
    }
  };

  const handleSkip = () => {
    if (rfc.trim() || direccion.trim()) {
      setConfirmarOmitir(true);
      return;
    }
    void submit({ skipFiscal: true });
  };

  return (
    <div className="min-h-dvh bg-muted/30 flex items-center justify-center p-4">
      <Seo
        title="Configura tu agencia · Libre Carga"
        description="Completa los datos de tu agencia de carga (RFC, dirección y moneda) para empezar a operar embarques y cotizaciones en Libre Carga."
        canonical="https://librecarga.com/onboarding"
        ogTitle="Configura tu agencia · Libre Carga"
        ogDescription="Últimos datos de tu agencia antes de empezar a operar embarques y cotizaciones en Libre Carga."
        ogUrl="https://librecarga.com/onboarding"
      />
      <ConfirmActionDialog
        open={confirmarOmitir}
        onOpenChange={setConfirmarOmitir}
        title="¿Continuar sin datos fiscales?"
        description="Se conservará la moneda elegida. El RFC y la dirección que capturaste se descartarán."
        confirmLabel="Continuar sin datos fiscales"
        cancelLabel="Conservar captura"
        onConfirm={() => {
          setConfirmarOmitir(false);
          void submit({ skipFiscal: true });
        }}
      />
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Completa los datos de tu agencia</CardTitle>
          <CardDescription>
            {organization?.nombre ? `Configuremos ${organization.nombre} ` : "Configuremos tu organización "}
            antes de continuar. Captura el RFC para guardar los datos fiscales o usa Configurar después para continuar sin ellos y completarlos desde Configuración.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!organizationId ? (
            <div className="space-y-3" role="status">
              <p>{error ?? "Aún no pudimos determinar tu organización. Reintenta la carga de tu acceso antes de capturar los datos."}</p>
              <Button variant="outline" onClick={() => void reintentar()} loading={reintentando}>Reintentar acceso</Button>
            </div>
          ) : (
          <OnboardingForm
            rfc={rfc}
            onRfcChange={setRfc}
            direccion={direccion}
            onDireccionChange={setDireccion}
            moneda={moneda}
            onMonedaChange={setMoneda}
            error={error}
            campoError={campoError}
            submitting={submitting}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
          />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
