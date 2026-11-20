import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consultarAprobacionMargen, aprobarMargen, solicitarAprobacionMargen } from '../aprobacionMargen';

const m = vi.hoisted(() => ({ rpc: vi.fn(), assertCurrent: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc } }));
vi.mock('@/lib/auth/authOperationScope', () => ({ captureAuthDataScope: () => ({ assertCurrent: m.assertCurrent }) }));
const snapshot = { moneda: 'USD' as const, venta: 9800, costo: 9445, margen_pct: 3.62, minimo_pct: 9,
  calculable: true, requiere_aprobacion: true, ventas: [{ cantidad: 1, precio_unitario: 9800, moneda: 'USD' }],
  costos: [{ monto: 9445, moneda: 'USD' }], tipo_cambio_usd: null };
const data = { estado: 'pendiente', snapshot, solicitada_at: '2026-11-20', autorizada_at: null, puede_aprobar: false };
beforeEach(() => { m.rpc.mockReset(); m.assertCurrent.mockReset(); m.rpc.mockResolvedValue({ data, error: null }); });
describe('contrato preparado de aprobación de margen', () => {
  it('lee el margen 3.62% contra mínimo 9% sin tocar datos', async () => {
    const result = await consultarAprobacionMargen('emb-1');
    expect(result?.snapshot).toEqual(snapshot);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('consultar_aprobacion_margen_embarque', { p_id: 'emb-1' });
  });
  it('candidata ausente conserva el candado actual', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find public.consultar_aprobacion_margen_embarque in schema cache' } });
    expect(await consultarAprobacionMargen('emb-1')).toBeNull();
  });
  it('ausencia de otra función no habilita el borrador', async () => {
    const error = { code: 'PGRST202', message: 'Could not find another_function' };
    m.rpc.mockResolvedValue({ data: null, error });
    await expect(consultarAprobacionMargen('emb-1')).rejects.toEqual(error);
  });
  it.each(['42501', 'PGRST301', 'NETWORK'])('rechazo %s no libera el candado', async (code) => {
    const error = { code, message: 'Consulta falló' };
    m.rpc.mockResolvedValue({ data: null, error });
    await expect(consultarAprobacionMargen('emb-1')).rejects.toEqual(error);
  });
  it('respuesta inválida tampoco habilita el borrador', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    await expect(consultarAprobacionMargen('emb-1')).rejects.toThrow();
  });
  it('aprueba el snapshot completo revisado, no sólo el porcentaje', async () => {
    await aprobarMargen('emb-1', snapshot, '  Caso especial autorizado  ');
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('aprobar_margen_embarque', {
      p_id: 'emb-1', p_snapshot: snapshot, p_motivo: 'Caso especial autorizado',
    });
  });
  it('solicita sin destinatarios elegidos por el navegador', async () => {
    await solicitarAprobacionMargen('emb-1');
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('solicitar_aprobacion_margen_embarque', { p_id: 'emb-1' });
  });
  it('cambio de organización cancela la respuesta', async () => {
    m.assertCurrent.mockImplementation(() => { throw new Error('Cambió la organización'); });
    await expect(consultarAprobacionMargen('emb-1')).rejects.toThrow('Cambió la organización');
  });
});
