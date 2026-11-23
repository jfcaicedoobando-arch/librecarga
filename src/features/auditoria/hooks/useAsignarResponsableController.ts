/**
 * Controlador del diálogo de asignación de responsable a un hallazgo.
 * Encapsula estado local, resolución de email y submit (asignar / tomar / quitar).
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  useAsignarResponsable,
  useOrgMembersAsignables,
} from "@/features/auditoria/hooks";
import type { AuditoriaRevision, HallazgoAuditoria } from "@/features/auditoria/types";

export const SIN_RESPONSABLE = "__sin__";

interface Args {
  hallazgo: HallazgoAuditoria | null;
  revisionExistente: AuditoriaRevision | null;
  open: boolean;
  onClose: () => void;
}

export function useAsignarResponsableController({
  hallazgo,
  revisionExistente,
  open,
  onClose,
}: Args) {
  const { user } = useAuth();
  const { data: asignables = [], isLoading: loadingUsers, isError: errorUsers,
    isFetching: fetchingUsers, refetch: refetchUsers } = useOrgMembersAsignables();
  const asignar = useAsignarResponsable();

  const [responsableId, setResponsableId] = useState<string>(SIN_RESPONSABLE);
  const [fechaLimite, setFechaLimite] = useState<Date | undefined>();

  useEffect(() => {
    if (!open) return;
    setResponsableId(revisionExistente?.responsable_id ?? SIN_RESPONSABLE);
    setFechaLimite(
      revisionExistente?.fecha_limite
        ? new Date(`${revisionExistente.fecha_limite}T00:00:00`)
        : undefined,
    );
  }, [open, revisionExistente]);

  const seleccionDisponible = !loadingUsers && !errorUsers;
  const seleccionado = responsableId === SIN_RESPONSABLE ? null : responsableId;
  const emailSeleccionado = seleccionado
    ? asignables.find((miembro) => miembro.id === seleccionado)?.email || revisionExistente?.responsable_email || ""
    : "";

  const submit = async (tomar = false) => {
    if (!hallazgo || (!tomar && !seleccionDisponible)) return;
    await asignar.mutateAsync({
      hallazgo,
      responsableId: tomar ? user?.id ?? null : seleccionado,
      responsableEmail: tomar ? user?.email ?? "" : emailSeleccionado,
      fechaLimite: fechaLimite ? format(fechaLimite, "yyyy-MM-dd") : null,
      tomar,
    });
    onClose();
  };

  return {
    user,
    asignables,
    loadingUsers, errorUsers, fetchingUsers, refetchUsers,
    responsableId,
    setResponsableId,
    fechaLimite,
    setFechaLimite,
    submit,
    cargando: asignar.isPending,
    yaAsignado: !!revisionExistente?.responsable_id,
    yoSoyResponsable: revisionExistente?.responsable_id === user?.id,
  };
}
