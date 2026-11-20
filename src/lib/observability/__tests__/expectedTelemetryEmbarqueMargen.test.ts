import { describe, it, expect } from 'vitest';
import { isExpectedTelemetryError } from '../expectedTelemetryError';

describe('rechazos de autorización del margen del borrador', () => {
  it.each(['PENDIENTE','CONFLICTO','NO_CALCULABLE','MOTIVO','SIN_SOLICITUD','SOLO_ADMIN','SIN_PERMISO','ESTADO_INVALIDO'])(
    '%s se muestra al usuario sin contarlo como falla del sistema', (codigo) => {
      expect(isExpectedTelemetryError({ message: `LC_EMBARQUE_MARGEN_${codigo}: prueba`, code: 'P0001' })).toBe(true);
    });
  it('no oculta un error desconocido del nuevo flujo', () => {
    expect(isExpectedTelemetryError({ message: 'LC_EMBARQUE_MARGEN_ERROR_INTERNO', code: 'P0001' })).toBe(false);
  });
});
