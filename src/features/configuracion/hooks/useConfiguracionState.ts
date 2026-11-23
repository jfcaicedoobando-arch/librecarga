import { useState, useEffect, useMemo } from "react";
import { useConfiguracion, useUpdateConfiguracion, type ConfigItem } from "./useConfiguracion";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";

export function getVal<T>(data: ConfigItem[] | undefined, categoria: string, clave: string, fallback: T): T {
  if (!data) return fallback;
  const item = data.find((c) => c.categoria === categoria && c.clave === clave);
  return item ? (item.valor as T) : fallback;
}

/**
 * Estado del módulo Configuración. Sólo incluye los campos que actualmente
 * tienen un consumidor real en la app:
 *   - empresa.* → leídos por `fetchEmisorEmpresa` para los encabezados de PDF
 *
 * El campo `facturacion.tasa_iva` se retiró en 13.170.0: el IVA general de
 * México (16%) está hardcodeado en `TASA_IVA` y cada producto del catálogo
 * define su propio tipo de IVA (16% / 0% / Exento).
 */
export interface ConfigState {
  nombre: string;
  subtitulo: string;
  rfc: string;
  direccion: string;
  email: string;
  telefono: string;
}

export function buildStateFromConfig(config: ConfigItem[] | undefined): ConfigState {
  return {
    nombre: getVal(config, "empresa", "nombre", ""),
    subtitulo: getVal(config, "empresa", "subtitulo", ""),
    rfc: getVal(config, "empresa", "rfc", ""),
    direccion: getVal(config, "empresa", "direccion_fiscal", ""),
    email: getVal(config, "empresa", "email", ""),
    telefono: getVal(config, "empresa", "telefono", ""),
  };
}

const CLAVES_EMPRESA = {
  nombre: "nombre",
  subtitulo: "subtitulo",
  rfc: "rfc",
  direccion: "direccion_fiscal",
  email: "email",
  telefono: "telefono",
} satisfies Record<keyof ConfigState, string>;
const CAMPOS = Object.keys(CLAVES_EMPRESA) as Array<keyof ConfigState>;

interface EdicionEmpresa {
  organizationId: string | null;
  original: ConfigState;
  form: ConfigState;
}

function camposEditados(form: ConfigState, original: ConfigState) {
  return CAMPOS.filter((campo) => form[campo] !== original[campo]);
}

export function useConfiguracionState() {
  const { organizationId } = useOrgActiva();
  const { data: config, isLoading, isError, refetch } = useConfiguracion();
  const updateConfig = useUpdateConfiguracion();
  const guardada = useMemo(() => buildStateFromConfig(config), [config]);
  const [edicion, setEdicion] = useState<EdicionEmpresa | null>(null);
  const actual = edicion?.organizationId === organizationId ? edicion : null;
  const s = actual?.form ?? guardada;
  const original = actual?.original ?? guardada;
  const cambios = camposEditados(s, original);
  const isDirty = cambios.length > 0;
  const cambioRemoto = isDirty && camposEditados(guardada, original).length > 0;

  useEffect(() => {
    setEdicion((prev) => {
      if (prev?.organizationId !== organizationId) return null;
      return camposEditados(prev.form, prev.original).length ? prev : null;
    });
  }, [guardada, organizationId]);

  const set = <K extends keyof ConfigState>(key: K) => (value: ConfigState[K]) =>
    setEdicion((prev) => {
      const base = prev?.organizationId === organizationId
        ? prev
        : { organizationId, original: guardada, form: guardada };
      return { ...base, form: { ...base.form, [key]: value } };
    });

  const handleSave = () => {
    if (!isDirty || updateConfig.isPending) return;
    const guardadaConCambios = { ...guardada };
    for (const campo of cambios) guardadaConCambios[campo] = s[campo];
    updateConfig.mutate(cambios.map((campo) => ({
      categoria: "empresa", clave: CLAVES_EMPRESA[campo], valor: s[campo],
    })), {
      onSuccess: () => setEdicion((prev) => {
        if (prev?.organizationId !== organizationId) return prev;
        const form = { ...guardadaConCambios };
        for (const campo of camposEditados(prev.form, s)) form[campo] = prev.form[campo];
        return { organizationId, form, original: guardadaConCambios };
      }),
    });
  };

  return {
    s,
    set,
    isLoading,
    // P1-1: la pantalla necesita distinguir "cargando" de "no se pudo cargar".
    isError,
    refetch: () => void refetch(),
    isSaving: updateConfig.isPending,
    isDirty,
    cambioRemoto,
    recargarGuardada: () => setEdicion(null),
    handleSave,
  };
}
