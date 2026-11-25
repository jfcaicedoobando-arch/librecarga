import { useEffect, useRef, useState } from "react";
import { useDirtyGuard } from "@/hooks/shared/useDirtyGuard";
import { useRegistrarActividad } from "@/features/auditoria";
import { useAuth } from "@/lib/contexts/AuthContext";
import { captureAuthOperationScope } from "@/lib/auth/authOperationScope";
import { useCreateNotaEmbarque } from "./mutations/useNotaEmbarque";

/** El borrador vive en el detalle para sobrevivir al cambio de pestaña. */
export function useBorradorNotaEmbarque(embarqueId?: string, expediente?: string | null, hayOtraCaptura = false) {
  const { user } = useAuth();
  const crearNota = useCreateNotaEmbarque();
  const registrarActividad = useRegistrarActividad();
  const enviosRef = useRef(new Set<string>());
  const [envios, setEnvios] = useState<string[]>([]);
  const [borrador, setBorrador] = useState({ embarqueId, texto: "" });
  const texto = borrador.embarqueId === embarqueId ? borrador.texto : "";
  useEffect(() => {
    setBorrador((actual) => actual.embarqueId === embarqueId ? actual : { embarqueId, texto: "" });
  }, [embarqueId]);

  const setTexto = (valor: string) => setBorrador((actual) =>
    actual.embarqueId === embarqueId ? { embarqueId, texto: valor } : actual,
  );
  const { guardDialog, confirmarSalida } = useDirtyGuard(texto.length > 0 || hayOtraCaptura, true);

  const enviarNota = async () => {
    const contenido = texto.trim();
    if (!embarqueId || !contenido || enviosRef.current.has(embarqueId)) return;
    const enviado = borrador;
    const authScope = captureAuthOperationScope();
    enviosRef.current.add(embarqueId);
    setEnvios([...enviosRef.current]);
    try {
      const notaId = await crearNota.mutateAsync({ embarqueId, contenido, usuario: user?.email ?? "" });
      registrarActividad.mutate({
        accion: "agregar_nota", modulo: "embarques", entidad_id: embarqueId, entidad_nombre: expediente ?? "",
        detalles: { nota: contenido, notaId }, authScope,
      });
      // La respuesta confirma el envío de esta versión del borrador.
      setBorrador((actual) => actual === enviado ? { ...actual, texto: "" } : actual);
    } catch {
      // La mutación notifica el error. La captura se conserva para reintentar.
    } finally {
      enviosRef.current.delete(embarqueId);
      setEnvios([...enviosRef.current]);
    }
  };

  return { texto, setTexto, enviarNota, enviando: envios.includes(embarqueId ?? ""), guardDialog, confirmarSalida };
}
