import { useNavigate, useParams } from "react-router";

import {
  useCliente,
  useContactosCliente,
  useCreateContacto,
  useUpdateContacto,
  useDeleteContacto,
  useUpdateCliente,
  useEmbarquesCliente,
  useCotizacionesCliente,
} from "@/features/cliente/hooks/useClientes";
import { useClienteFinancials } from "@/features/cliente/hooks/useClienteFinancials";
import { usePermissions, useRegistrarActividad } from "@/hooks/shared";
import { useClienteDetalleHandlers } from "./useClienteDetalleHandlers";

;

/**
 * Controller-hook para la página de detalle de cliente. Centraliza queries,
 * mutations, estado de diálogos y handlers, dejando ClienteDetalle.tsx como
 * composición pura de UI. Los handlers viven en `useClienteDetalleHandlers.ts`
 * y los tipos en `useClienteDetalleController.types.ts` (Power-of-10 ≤200 LOC).
 */
export function useClienteDetalleController() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Queries
  const { data: cliente, isLoading: loadingCliente, error: errorCliente, refetch: refetchCliente } = useCliente(id);
  const { data: contactos = [], isLoading: loadingContactos } = useContactosCliente(id);
  const { data: embarquesCliente = [], isLoading: loadingEmbarques, error: errorEmbarques,
    refetch: refetchEmbarques, isFetching: fetchingEmbarques } = useEmbarquesCliente(id);
  const { data: cotizacionesCliente = [], isLoading: loadingCotizaciones, error: errorCotizaciones,
    refetch: refetchCotizaciones, isFetching: fetchingCotizaciones } = useCotizacionesCliente(id);
  const { data: financials, error: errorFinancials, refetch: refetchFinancials,
    isFetching: fetchingFinancials } = useClienteFinancials(id);

  // Mutations
  const createContacto = useCreateContacto();
  const updateContacto = useUpdateContacto();
  const deleteContacto = useDeleteContacto();
  const updateCliente = useUpdateCliente();

  // Permisos / bitácora
  const { canEdit } = usePermissions();
  const registrarActividad = useRegistrarActividad();

  // Handlers + estado de diálogos (sub-hook)
  const handlers = useClienteDetalleHandlers({
    cliente,
    createContacto,
    updateContacto,
    deleteContacto,
    updateCliente,
    registrarActividad,
  });

  return {
    navigate,
    cliente,
    loadingCliente,
    errorCliente,
    refetchCliente,
    contactos,
    loadingContactos,
    embarquesCliente,
    loadingEmbarques,
    errorEmbarques, refetchEmbarques, fetchingEmbarques,
    cotizacionesCliente,
    loadingCotizaciones,
    errorCotizaciones, refetchCotizaciones, fetchingCotizaciones,
    financials,
    errorFinancials, refetchFinancials, fetchingFinancials,
    canEdit,
    isContactSaving: createContacto.isPending || updateContacto.isPending,
    isClientSaving: updateCliente.isPending,
    isContactDeleting: deleteContacto.isPending,
    ...handlers,
  };
}
