/** Rechazos funcionales del flujo preparado de aprobación del margen de borrador. */
export const LC_CODE_MESSAGES_EMBARQUE_MARGEN: Record<string, string> = {
  LC_EMBARQUE_MARGEN_PENDIENTE: 'Administración debe aprobar el margen antes de iniciar operaciones. Puedes conservar el borrador.',
  LC_EMBARQUE_MARGEN_CONFLICTO: 'Cambiaron los importes o el tipo de cambio. Recarga el borrador y revisa los valores antes de aprobar.',
  LC_EMBARQUE_MARGEN_NO_CALCULABLE: 'Completa la venta y los tipos de cambio necesarios para calcular el margen.',
  LC_EMBARQUE_MARGEN_MOTIVO: 'Captura un motivo de aprobación de entre 10 y 500 caracteres.',
  LC_EMBARQUE_MARGEN_SIN_SOLICITUD: 'Guarda el borrador o solicita la aprobación del margen antes de aprobarlo.',
  LC_EMBARQUE_MARGEN_SOLO_ADMIN: 'Sólo Administración de esta organización puede aprobar el margen del borrador.',
  LC_EMBARQUE_MARGEN_SIN_PERMISO: 'Tu rol no tiene acceso a la aprobación del margen de este borrador.',
  LC_EMBARQUE_MARGEN_ESTADO_INVALIDO: 'La aprobación del margen sólo se solicita o registra mientras el embarque sea borrador.',
};
