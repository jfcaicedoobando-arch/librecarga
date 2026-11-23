import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { parseCsf } from "@/features/cliente/services/csf";
import { getErrorMessage } from "@/lib/errors";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { ERROR_CODES } from "@/lib/domain/errorCatalog";
import { camposExtraidosClienteCsf } from "./nuevoClienteFormState";
import type { ClienteForm } from "./useNuevoClienteController.constants";

export function useLecturaCsfCliente(setForm: Dispatch<SetStateAction<ClienteForm>>) {
  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [lecturaCsf, setLecturaCsf] = useState<"pendiente" | "leyendo" | "leida" | "manual">("pendiente");
  const [camposCsf, setCamposCsf] = useState<ReadonlySet<keyof ClienteForm>>(new Set());
  const parseRequest = useRef(0);
  useEffect(() => () => { parseRequest.current += 1; }, []);

  const adjuntar = (file: File | null) => {
    parseRequest.current += 1;
    setLecturaCsf("pendiente");
    setCamposCsf(new Set());
    setCsfFile(file);
  };

  const retirarMarca = (field: keyof ClienteForm) => {
    setCamposCsf((prev) => prev.has(field) ? new Set([...prev].filter((key) => key !== field)) : prev);
  };

  const handleCsfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 15 * 1024 * 1024) {
      notifyError(undefined, {
        title: "Archivo inválido",
        description: "Solo se aceptan archivos PDF de hasta 15 MB.",
        method: "HANDLE_CSF_UPLOAD",
        errorCode: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    adjuntar(file);
    const request = parseRequest.current;
    setLecturaCsf("leyendo");
    try {
      const datos = await parseCsf(file);
      if (request !== parseRequest.current) return;
      const extraidos = camposExtraidosClienteCsf(datos);
      setForm((prev) => ({ ...prev, ...extraidos }));
      setCamposCsf(new Set(Object.keys(extraidos) as Array<keyof ClienteForm>));
      setLecturaCsf("leida");
      notifySuccess(undefined, { title: "Datos extraídos", description: "Revisa la información antes de continuar." });
    } catch (error: unknown) {
      if (request !== parseRequest.current) return;
      setLecturaCsf("manual");
      notifyError(undefined, {
        title: "No se pudieron extraer los datos",
        description: `La CSF sigue adjunta. Captura o revisa los datos manualmente. ${getErrorMessage(error)}`,
        error,
        method: "HANDLE_CSF_UPLOAD",
      });
    }
  };

  return {
    adjuntar, retirarMarca, handleCsfUpload, csfFile, camposCsf, lecturaCsf,
    parsingCsf: lecturaCsf === "leyendo",
    csfParsed: lecturaCsf === "leida",
  };
}
