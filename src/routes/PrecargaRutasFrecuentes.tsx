import { useEffect } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { precargarRutasFrecuentes } from "./appRoutes.lazy";

/** Prepara las páginas de uso frecuente cuando la sesión y el perfil están listos. */
export function PrecargaRutasFrecuentes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!user || loading) return;

    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(precargarRutasFrecuentes);
      return () => {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
      };
    }

    const timeout = setTimeout(precargarRutasFrecuentes, 1500);
    return () => clearTimeout(timeout);
  }, [user, loading]);

  return null;
}
