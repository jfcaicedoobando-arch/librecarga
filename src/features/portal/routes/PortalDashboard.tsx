import { PortalPageShell } from "@/features/portal/components/layout/PortalPageShell";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/shared/skeletons";
import { SolicitarCotizacionDialog } from "@/features/portal/components/SolicitarCotizacionDialog";

import {
  usePortalEmbarques,
  usePortalCotizaciones,
  usePortalClientUsers,
  usePortalClienteName,
  usePortalContactoNombre,
  usePortalOrgName,
} from "@/features/portal/hooks";
import { usePortalDashboardKpis } from "@/features/portal/hooks";
import { useEstadoCuenta } from "@/features/facturacion/estadoCuenta/hooks/useEstadoCuenta";

import { PortalWelcomeCard } from "@/features/portal/components/dashboard/PortalWelcomeCard";
import { PortalKpiGrid } from "@/features/portal/components/dashboard/PortalKpiGrid";
import { PortalEstadoEmbarquesCard } from "@/features/portal/components/dashboard/PortalEstadoEmbarquesCard";
import { PortalProximosArribosCard } from "@/features/portal/components/dashboard/PortalProximosArribosCard";
import { PortalFacturacionPendienteCard } from "@/features/portal/components/dashboard/PortalFacturacionPendienteCard";
import { PortalEmbarquesRecientesCard } from "@/features/portal/components/dashboard/PortalEmbarquesRecientesCard";
import { useDocumentTitle } from "@/hooks/shared";
import { opcionesSolicitante } from "@/features/portal/domain/clientesSolicitantes";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";

export default function PortalDashboard() {
  useDocumentTitle('Portal');
  const [solicitudAbierta, setSolicitudAbierta] = useState(false);
  const { data: clientUsers = [], isLoading: loadingClientes, isError: errorClientes, refetch: refetchClientes } =
    usePortalClientUsers();
  const { data: clienteName } = usePortalClienteName();
  const { data: contactoName } = usePortalContactoNombre();
  const { data: orgName } = usePortalOrgName();
  // Opciones autorizadas con nombre legible: la solicitud ya no se atribuye
  // en silencio al primer cliente del usuario.
  const clientes = useMemo(() => opcionesSolicitante(clientUsers), [clientUsers]);
  const clienteIds = useMemo(() => clientes.map((c) => c.id), [clientes]);
  const { data: embarques = [], isLoading: loadingEmb, isError: errorEmb, refetch: refetchEmb } = usePortalEmbarques(clienteIds);
  const { data: cotizaciones = [], isLoading: loadingCot, isError: errorCot, refetch: refetchCot } = usePortalCotizaciones(clienteIds);
  // B-068/B-076: la tarjeta de Facturación Pendiente se alimenta del MISMO
  // agregado que el estado de cuenta del portal — saldo real por moneda
  // (incluye Parcialmente pagada y resta pagos + notas de crédito).
  const saldos = useEstadoCuenta({
    clienteIds,
    soloConSaldo: true,
  });

  const {
    embarquesActivos,
    proximosArribos,
    estadoDistribucion,
  } = usePortalDashboardKpis(embarques);

  const cargando = loadingClientes || loadingEmb || loadingCot;

  return (
    <PortalPageShell>
      {(errorClientes || errorEmb || errorCot) && (
        <ErrorState
          className="mb-2"
          onRetry={() => {
            if (errorClientes) void refetchClientes();
            if (errorEmb) void refetchEmb();
            if (errorCot) void refetchCot();
          }}
        />
      )}
      {/* UI-4: el saludo y el acceso a "Solicitar cotización" se pintan desde el
          primer frame; sólo el cuerpo de datos se sustituye por el esqueleto. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          {/* Con varias empresas no se afirma el nombre de una sola. */}
          <PortalWelcomeCard clienteName={clientes.length === 1 ? clienteName : null} contactoName={contactoName} orgName={orgName} />
        </div>
        <Button className="sm:self-stretch" onClick={() => setSolicitudAbierta(true)}>
          <Plus className="h-4 w-4 mr-1" aria-hidden /> Solicitar cotización
        </Button>
      </div>


      <SolicitarCotizacionDialog
        open={solicitudAbierta}
        onOpenChange={setSolicitudAbierta}
        clientes={clientes}
      />

      {cargando ? (
        <DashboardSkeleton kpis={3} charts={2} />
      ) : (
        <>
          <PortalKpiGrid
            values={{
              embarques: embarquesActivos.length,
              cotizaciones: cotizaciones.filter((c) => c.estado === "Enviada").length,
              facturas: saldos.hasData ? saldos.kpis.facturasAdeudadas : null,
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PortalEstadoEmbarquesCard
              total={embarquesActivos.length}
              distribucion={estadoDistribucion}
            />
            <PortalProximosArribosCard items={proximosArribos} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FacturacionPendiente saldos={saldos} errorClientes={errorClientes} />
            <PortalEmbarquesRecientesCard
              embarques={embarquesActivos}
              className="lg:col-span-2"
            />
          </div>
        </>
      )}

    </PortalPageShell>
  );
}

function FacturacionPendiente({
  saldos: { kpis, hasData, isLoading, isError, refetch },
  errorClientes,
}: {
  saldos: ReturnType<typeof useEstadoCuenta>;
  errorClientes: boolean;
}) {
  return (
    <section aria-label="Facturación pendiente" className="space-y-2">
      {isError && (
        <ErrorState
          title={hasData ? "No pudimos actualizar tus saldos" : "No pudimos consultar tus saldos"}
          description={hasData ? "Se muestran los saldos de la última consulta exitosa." : undefined}
          onRetry={() => void refetch()}
        />
      )}
      {hasData ? (
        <PortalFacturacionPendienteCard
          montos={kpis.adeudado}
          total={kpis.facturasAdeudadas}
          vencidas={kpis.facturasVencidas}
        />
      ) : isLoading ? (
        <EmptyStateInline loading message="Cargando saldos…" />
      ) : !isError && !errorClientes && (
        <EmptyStateInline message="Los saldos estarán disponibles cuando tengas una empresa vinculada." />
      )}
    </section>
  );
}
