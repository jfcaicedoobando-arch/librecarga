import { useRef } from "react";
import { matchPath, useLocation, useNavigate } from "react-router";

interface EstadoEdicionEmbarque {
  desdeDetalleEmbarque?: boolean;
}

export function useDestinoEdicionEmbarque(id: string | undefined, paso?: number) {
  const { pathname } = useLocation();
  const detalle = `/embarques/${id}`;
  return {
    to: `${detalle}/editar${paso ? `?step=${paso}` : ""}`,
    state: matchPath(detalle, pathname) ? { desdeDetalleEmbarque: true } : undefined,
  };
}

export function useVolverAlDetalleEmbarque(id: string | undefined) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const volviendo = useRef(false);
  return () => {
    if (volviendo.current) return;
    volviendo.current = true;
    // El detalle ya está en el historial. Volver allí conserva su pestaña y
    // deja la entrada del listado filtrado inmediatamente anterior al detalle.
    if ((state as EstadoEdicionEmbarque | null)?.desdeDetalleEmbarque === true) {
      navigate(-1);
    } else {
      navigate(`/embarques/${id}`, { replace: true, state: { from: "/embarques" } });
    }
  };
}
