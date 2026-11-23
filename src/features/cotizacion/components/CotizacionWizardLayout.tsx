import { useCallback, useRef, useState } from "react";
import { FormProvider } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { WizardShell } from "@/components/shared/WizardShell";
import { CotizacionWizardFooter } from "@/features/cotizacion/components/wizard/CotizacionWizardFooter";
import { CotizacionWizardSteps } from "@/features/cotizacion/components/wizard/CotizacionWizardSteps";
import { ConfirmSinDesgloseDialog } from "@/features/cotizacion/components/ConfirmSinDesgloseDialog";
import { WizardTotalsBar } from "@/features/cotizacion/components/wizard/WizardTotalsBar";
import { useCotizacionKeyboardShortcuts } from "@/features/cotizacion/hooks/wizard/useCotizacionKeyboardShortcuts";
import { usePermissions } from "@/hooks/shared";
import { useCotizacionFolio } from "@/features/cotizacion/hooks/useCotizacionQueries";
import { useDirtyGuard } from "@/hooks/shared/useDirtyGuard";
import { ejecutarSalidaWizard } from "@/features/cotizacion/components/wizard/salidaWizard";
import type { EstadoCatalogoClientes } from "./seccionDestinatario/EstadoConsultaClientes";

const WIZARD_STEPS = [
  { num: 1, title: "Datos Generales", shortTitle: "Generales" },
  { num: 2, title: "Costos y utilidad", shortTitle: "Costos" },
  { num: 3, title: "Cotización del cliente", shortTitle: "Cliente" },
  { num: 4, title: "Resumen" },
];

type WizardForm = ReturnType<typeof import("@/features/cotizacion/hooks").useCotizacionWizardForm>;

interface CotizacionWizardLayoutProps {
  w: WizardForm;
  clientes: { id: string; nombre: string }[];
  catalogoClientes: EstadoCatalogoClientes;
  title: string;
  subtitle?: string;
  onBack: () => void;
  saveLabel: string;
  /** P1 (v13.294.1): flush del autosave para atajo Ctrl/Cmd+S. */
  onFlushDraft?: () => void;
  esAlta?: boolean;
}

export default function CotizacionWizardLayout({
  w,
  clientes,
  catalogoClientes,
  title,
  subtitle,
  onBack,
  saveLabel,
  onFlushDraft,
  esAlta = false,
}: CotizacionWizardLayoutProps) {
  const { data: folioBorrador } = useCotizacionFolio(esAlta ? w.cotizacionId : null);
  const { form, handleSiguiente, handleGuardar, handleBack: wHandleBack, handleCotizarSinDesglose, isPending } = w;
  const pasosRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSinDesglose, setShowSinDesglose] = useState(false);
  const isBusy = isProcessing || isPending;
  const sinDesgloseFlag = !!form.watch("sinDesgloseCostos");
  const modoActual = (form.watch("modo") || "").toString().toLowerCase();
  const esMaritimo = modoActual.startsWith("mar");
  const { canCotizarSinDesglose } = usePermissions();

  const runProcessing = useCallback(async (fn: () => unknown | Promise<unknown>) => {
    if (isBusy) return;
    setIsProcessing(true);
    try { await fn(); } finally { setIsProcessing(false); }
  }, [isBusy]);

  const handleNext = useCallback(() => {
    void runProcessing(() => {
      if (w.currentStep === 2) {
        pasosRef.current?.querySelector<HTMLElement>(
          '[data-costo-cotizacion] [aria-describedby^="costo-"]:not([disabled])',
        )?.focus();
      }
      return handleSiguiente();
    });
  }, [runProcessing, handleSiguiente, w.currentStep]);
  const handleSave = useCallback(() => { void runProcessing(handleGuardar); }, [runProcessing, handleGuardar]);
  const { guardDialog, confirmarSalida } = useDirtyGuard(form.formState.isDirty && !isBusy);
  const handleBack = useCallback(
    () => ejecutarSalidaWizard({
      currentStep: w.currentStep,
      isBusy,
      retroceder: wHandleBack,
      confirmarSalida,
    }),
    [w.currentStep, isBusy, wHandleBack, confirmarSalida],
  );

  const handleConfirmSinDesglose = useCallback(() => {
    if (!canCotizarSinDesglose) {
      notifyError(undefined, { title: "Tu rol no autoriza cotizar sin desglose. Pide a un gerente o admin.", method: "FEATURES_COTIZACION_COMPONENTS_COTIZACIONWIZARDLAYOUT_1" });
      setShowSinDesglose(false);
      return;
    }
    setShowSinDesglose(false);
    void runProcessing(handleCotizarSinDesglose);
  }, [runProcessing, handleCotizarSinDesglose, canCotizarSinDesglose]);

  const handleOpenSinDesglose = useCallback(() => {
    if (!canCotizarSinDesglose) {
      notifyError(undefined, { title: "Tu rol no autoriza cotizar sin desglose. Pide a un gerente o admin.", method: "FEATURES_COTIZACION_COMPONENTS_COTIZACIONWIZARDLAYOUT_2" });
      return;
    }
    setShowSinDesglose(true);
  }, [canCotizarSinDesglose]);

  const irACargarCostos = useCallback(() => {
    if (!isBusy) wHandleBack();
  }, [isBusy, wHandleBack]);

  const mostrarTotales = w.currentStep === 2 || w.currentStep === 3;

  const handleBackHeader = useCallback(() => { confirmarSalida(onBack); }, [confirmarSalida, onBack]);

  const handleFlushDraft = useCallback(() => {
    if (!onFlushDraft) return;
    onFlushDraft();
    notifySuccess(undefined, { title: "Borrador guardado" });
  }, [onFlushDraft]);
  useCotizacionKeyboardShortcuts({
    currentStep: w.currentStep,
    onNext: handleNext,
    onSave: handleSave,
    onBack: handleBack,
    onFlushDraft: onFlushDraft ? handleFlushDraft : undefined,
  });

  return (
    <FormProvider {...form}>
      <WizardShell
        title={title}
        subtitle={folioBorrador ? `Borrador ${folioBorrador}` : subtitle}
        steps={WIZARD_STEPS}
        currentStep={w.currentStep}
        onStepClick={(s) => w.setCurrentStep(s)}
        onBack={handleBackHeader}
        isBusy={isBusy}
        contentMaxWidth="6xl"
        footer={
          <>
            {mostrarTotales && <WizardTotalsBar plUSD={w.plUSD} plMXN={w.plMXN}
              conceptosVenta={w.currentStep === 3 ? [...w.conceptosUSD, ...w.conceptosMXN] : undefined}
              sinCostosRegistrados={w.currentStep === 3 && w.costosInternos.length === 0} />}
            <CotizacionWizardFooter
              currentStep={w.currentStep}
              isPending={w.isPending}
              isProcessing={isProcessing}
              saveLabel={saveLabel}
              onBack={handleBack}
              onNext={handleNext}
              onSave={handleSave}
              onCotizarSinDesglose={handleOpenSinDesglose}
              canSkipCostos={canCotizarSinDesglose}
              guardarBorradorAlContinuar={esAlta}
            />
          </>
        }
      >
        {w.currentStep === 1 && w.vinculoCrmError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Falta el vínculo con el CRM</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>
                La cotización se guardó como borrador, pero no se pudo ligar al prospecto u
                oportunidad del CRM: {w.vinculoCrmError}
              </span>
              <Button size="sm" variant="outline" onClick={handleNext} disabled={isBusy}>
                Reintentar vínculo y continuar
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div ref={pasosRef}>
          <CotizacionWizardSteps
            w={w}
            clientes={clientes}
            catalogoClientes={catalogoClientes}
            esMaritimo={esMaritimo}
            sinDesgloseFlag={sinDesgloseFlag}
            irACargarCostos={irACargarCostos}
            bloqueado={isBusy}
          />
        </div>
      </WizardShell>

      <ConfirmSinDesgloseDialog
        open={showSinDesglose}
        onOpenChange={setShowSinDesglose}
        onConfirm={handleConfirmSinDesglose}
        isPending={isBusy}
      />
      {guardDialog}
    </FormProvider>
  );
}

