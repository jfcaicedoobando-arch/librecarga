/**
 * Detalle de una solicitud: datos del solicitante, reloj, respuesta y acciones.
 * La respuesta son tarifas del catálogo ligadas a la solicitud; las opciones
 * capturadas con el formulario anterior se muestran sólo para consulta.
 */
import { useState } from "react";
import { AjustePlazoPricing } from "./AjustePlazoPricing";
import { esGerenteOps } from "@/features/crm/services/pricing/plazoPricing";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/contexts/AuthContext";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useOpcionesPricing } from "@/features/crm/hooks/usePricingCrm";
import { useTarifasRespuestaPricing } from "@/features/crm/hooks/useTarifasRespuestaPricing";
import { esRolPricing, esAutorSolicitud, puedeAgregarTarifaRespuesta, puedeEditarSolicitud, solicitudAbierta } from "@/features/crm/services/pricing/permisosPricing";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { AccionesSolicitudPricing } from "./AccionesSolicitudPricing";
import { AdjuntosSolicitudPricing } from "./AdjuntosSolicitudPricing";
import { OpcionPricingEditor } from "./OpcionPricingEditor";
import { EnviarSolicitudFinal } from "./EnviarSolicitudFinal";
import { ResumenSolicitudPricing } from "./ResumenSolicitudPricing";
import { OpcionesTarifario } from "./OpcionesTarifario";
import { OpcionesTarifarioAereo } from "./OpcionesTarifarioAereo";
import { OpcionesTarifarioTerrestre } from "./OpcionesTarifarioTerrestre";
import { SolicitudPricingDialog } from "./SolicitudPricingDialog";
import { TarifasRespuestaPricing } from "./TarifasRespuestaPricing";

interface Props { solicitud: SolicitudPricingRow }

function puedeUsarRespuesta(s: SolicitudPricingRow, userId: string | undefined, esPricing: boolean) {
  return esPricing || esAutorSolicitud(s, userId);
}

function estadoConsultaRespuesta(
  opciones: ReturnType<typeof useOpcionesPricing>,
  tarifas: ReturnType<typeof useTarifasRespuestaPricing>,
) {
  return {
    enCurso: opciones.isFetching || opciones.isPending || tarifas.isFetching || tarifas.isPending,
    error: opciones.isError || tarifas.isError,
    reintentar: () => { void opciones.refetch(); void tarifas.refetch(); },
  };
}

export function SolicitudPricingDetalle({ solicitud: s }: Props) {
  const { effectiveRole, user } = useAuth();
  const { canWriteCotizaciones } = usePermissions();
  const navigate = useNavigate();
  const userId = user?.id;
  const [editando, setEditando] = useState(false);
  const esPricing = esRolPricing(effectiveRole);
  const opcionesRespuesta = useOpcionesPricing(s.id);
  const opciones = opcionesRespuesta.data ?? [];
  const tarifasRespuesta = useTarifasRespuestaPricing(s.id, s.estado === "enviada");
  const editable = esPricing && s.estado === "enviada";
  const puedeCancelar = solicitudAbierta(s) && (esPricing || s.created_by === userId);
  const puedeEditar = puedeEditarSolicitud(s, userId, esPricing);
  const puedeElegir = puedeUsarRespuesta(s, userId, esPricing);
  const puedeCotizar = puedeElegir && canWriteCotizaciones;
  const tarifas = tarifasRespuesta.data ?? [];
  const tarifasRespondidas = s.estado === "respondida"
    ? new Set(tarifas.map((tarifa) => tarifa.id))
    : undefined;
  const cotizarRespuesta = (tarifaId: string) => {
    // La tarifa ya responde a esta solicitud; cotizar no vuelve a seleccionarla ni cambia su estado.
    const q = new URLSearchParams({ tarifa: tarifaId, solicitud: s.id });
    if (s.oportunidad_id) q.set("oportunidad", s.oportunidad_id);
    navigate(`/cotizaciones/nueva?${q.toString()}`);
  };

  return (
    <div className="space-y-4">
      <AccionesSolicitudPricing solicitud={s} puedeCancelar={puedeCancelar} puedeResponder={editable}
        puedeEditar={puedeEditar} puedeCopiar={puedeElegir} onEditar={() => setEditando(true)}
        numOpciones={opciones.length + tarifas.length}
        consultaRespuesta={estadoConsultaRespuesta(opcionesRespuesta, tarifasRespuesta)} />
      <SolicitudPricingDialog open={editando} onOpenChange={setEditando}
        oportunidadId={s.oportunidad_id ?? ""} solicitud={s} />
      <ResumenSolicitudPricing solicitud={s} />
      {esGerenteOps(effectiveRole) && <AjustePlazoPricing solicitud={s} />}
      <AdjuntosSolicitudPricing organizationId={s.organization_id} solicitudId={s.id}
        puedeAdjuntar={s.estado !== "cancelada"} />
      {s.servicio === "Aéreo" ? <OpcionesTarifarioAereo solicitud={s} puedeCotizar={puedeCotizar} />
        : s.servicio === "Terrestre" ? <OpcionesTarifarioTerrestre solicitud={s} puedeCotizar={puedeCotizar} /> : (
        <OpcionesTarifario solicitud={s} puedeElegir={puedeElegir} puedeCotizar={puedeCotizar}
          tarifasRespondidas={tarifasRespondidas} />
      )}
      <EnviarSolicitudFinal solicitud={s} puede={puedeElegir} />
      {opciones.map((o) => (
        <OpcionPricingEditor key={o.id} solicitudId={s.id} organizationId={s.organization_id}
          orden={o.orden} opcion={o} editable={false} />
      ))}
      <TarifasRespuestaPricing solicitudId={s.id} aereo={s.servicio === "Aéreo" ? { pol: s.pol, pod: s.pod } : undefined}
        terrestre={s.servicio === "Terrestre" ? { submodalidad: s.submodalidad, origen: s.origen_cp ?? s.pol, destino: s.destino_cp ?? s.pod, tipoUnidad: s.tipo_unidad } : undefined} hayOpcionesViejas={opciones.length > 0}
        tarifas={tarifas} isLoading={tarifasRespuesta.isLoading}
        isError={tarifasRespuesta.isError} isFetching={tarifasRespuesta.isFetching} onSaved={() => { void tarifasRespuesta.refetch(); }}
        onCotizar={puedeCotizar && s.estado === "respondida" ? cotizarRespuesta : undefined}
        editable={(s.estado === "enviada" || s.estado === "respondida") && puedeAgregarTarifaRespuesta(effectiveRole)} />
    </div>
  );
}
