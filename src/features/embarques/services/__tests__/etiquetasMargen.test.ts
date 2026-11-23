import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consultarEtiquetasMargen } from '../etiquetasMargen';

const m = vi.hoisted(() => ({ rpc: vi.fn(), assertCurrent: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc } }));
vi.mock('@/lib/auth/authOperationScope', () => ({ captureAuthDataScope: () => ({ assertCurrent: m.assertCurrent }) }));
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: {}, error: null }); });
describe('identificación y autor de margen bajo', () => {
  it('conserva el ID, correo y fecha verificados del autorizador', async () => {
    const aprobada = { autorizada_por: '10000000-0000-4000-8000-000000000002',
      autorizada_email: 'administracion@example.test', autorizada_at: '2026-11-20T17:50:00Z', vigente: true };
    m.rpc.mockResolvedValue({ data: { embarque: aprobada }, error: null });
    expect(await consultarEtiquetasMargen(['embarque'])).toEqual({ embarque: aprobada });
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('consultar_etiquetas_margen_embarques', { p_ids: ['embarque'] });
  });
  it('una solicitud pendiente no se atribuye a quien la solicitó', async () => {
    m.rpc.mockResolvedValue({ data: { embarque: { autorizada_por: null, autorizada_email: null, autorizada_at: null, vigente: false } }, error: null });
    const result = await consultarEtiquetasMargen(['embarque']);
    expect(result.embarque.autorizada_por).toBeNull();
    expect(result.embarque.vigente).toBe(false);
  });
  it('consulta 201 filas en lotes de 100 sin una llamada por embarque', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `emb-${i}`);
    await consultarEtiquetasMargen(ids);
    expect(m.rpc).toHaveBeenCalledTimes(3);
    expect(m.rpc.mock.calls.map((call) => call[1].p_ids.length)).toEqual([100, 100, 1]);
  });
  it('no activa etiquetas si la candidata todavía no está instalada', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'consultar_etiquetas_margen_embarques not found' } });
    expect(await consultarEtiquetasMargen(['embarque'])).toEqual({});
  });
  it('no oculta permisos denegados ni convierte respuestas inválidas en etiquetas', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Sin permiso' } });
    await expect(consultarEtiquetasMargen(['embarque'])).rejects.toMatchObject({ code: '42501' });
    m.rpc.mockResolvedValueOnce({ data: { embarque: { vigente: true } }, error: null });
    await expect(consultarEtiquetasMargen(['embarque'])).rejects.toThrow();
  });
  it('descarta una respuesta al cambiar de organización', async () => {
    m.assertCurrent.mockImplementationOnce(() => { throw new Error('Organización cambió'); });
    await expect(consultarEtiquetasMargen(['embarque'])).rejects.toThrow('Organización cambió');
  });
});