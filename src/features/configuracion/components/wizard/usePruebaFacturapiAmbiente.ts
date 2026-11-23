import { useEffect, useRef, useState } from "react";
import { useProbarFacturapiConexion } from "@/features/configuracion/hooks/useFacturapiCredenciales";
import type { FacturapiAmbiente, ProbarConexionResult } from "@/features/configuracion/services/facturapiCredenciales";

export function usePruebaFacturapiAmbiente(
  orgId: string, ambiente: FacturapiAmbiente, llave: string | null, open: boolean,
) {
  const probar = useProbarFacturapiConexion(orgId);
  const [prueba, setPrueba] = useState<{ alcance: string; dato: ProbarConexionResult } | null>(null);
  const intento = useRef(0);
  const alcance = JSON.stringify([orgId, ambiente, llave, open]);
  useEffect(() => {
    setPrueba(null);
    return () => { intento.current += 1; };
  }, [alcance]);

  const onProbar = async () => {
    const id = ++intento.current;
    const terminar = (dato: ProbarConexionResult) => {
      if (id === intento.current) setPrueba({ alcance, dato });
    };
    setPrueba(null);
    try {
      terminar(await probar.mutateAsync(ambiente));
    } catch (error) {
      terminar({ ok: false, status: 0, message: error instanceof Error ? error.message : "Error desconocido" });
    }
  };

  const resultado = prueba?.alcance === alcance ? prueba.dato : null;
  return {
    resultado,
    aprobada: !!resultado?.ok && !probar.isPending,
    probando: probar.isPending,
    onProbar,
  };
}
