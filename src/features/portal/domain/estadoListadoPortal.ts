interface ConsultaPortal {
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

export function estadoListadoPortal(cuentas: ConsultaPortal, listado: ConsultaPortal, errorListado: string) {
  const cargandoCuentas = cuentas.isError || cuentas.isLoading;
  const consulta = cargandoCuentas ? cuentas : listado;
  if (!consulta.isLoading && !consulta.isError) return null;

  return {
    error: consulta.isError,
    errorLabel: cargandoCuentas ? "No pudimos cargar tus cuentas vinculadas" : errorListado,
    onRetry: () => void consulta.refetch(),
  };
}
