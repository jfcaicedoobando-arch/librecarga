import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { solicitarPerfilFiscal, type SolicitudPerfilFiscal } from "../services/perfilFiscalEmisor";
import { facturapiCredencialesKeys, perfilFiscalEmisorKeys } from "../queryKeys";
import type { FacturapiAmbiente } from "../services/facturapiCredenciales";

export function usePerfilFiscalEmisor(orgId: string, ambiente: FacturapiAmbiente) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = perfilFiscalEmisorKeys.detalle(orgId, ambiente, user?.id ?? "sin-sesion");
  const scope = JSON.stringify(key);
  const active = useRef<string | null>(scope);
  useEffect(() => {
    active.current = scope;
    return () => { active.current = null; };
  }, [scope]);
  const query = useQuery({
    queryKey: key, enabled: !!user?.id, staleTime: 0,
    queryFn: () => solicitarPerfilFiscal({ organization_id: orgId, ambiente, accion: "consultar" }),
  });
  const mutation = useMutation({
    onMutate: () => ({ key, orgId, scope }),
    mutationFn: (accion: Pick<SolicitudPerfilFiscal, "accion" | "perfil_id" | "vigente_desde">) => {
      if (!user?.id) throw new Error("Inicia sesión para administrar el perfil fiscal.");
      return solicitarPerfilFiscal({ ...accion, organization_id: orgId, ambiente });
    },
    onSuccess: (_data, variables, context) => {
      if (active.current !== context?.scope) return;
      notifySuccess(undefined, { title: variables.accion === "confirmar" ? "Perfil fiscal confirmado" : "Datos fiscales sincronizados" });
    },
    onSettled: async (_data, _error, _variables, context) => {
      if (!context) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: context.key }),
        qc.invalidateQueries({ queryKey: facturapiCredencialesKeys.byOrg(context.orgId) }),
      ]);
    },
    onError: (error, _variables, context) => {
      if (active.current !== context?.scope) return;
      notifyError(undefined, { title: "No se pudo actualizar el perfil fiscal",
        description: error.message, method: "usePerfilFiscalEmisor", error });
    },
  });
  return { query, mutation };
}
