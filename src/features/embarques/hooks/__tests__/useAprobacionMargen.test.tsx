import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils/queryWrapper';
import { useAprobacionMargen } from '../useAprobacionMargen';

const m = vi.hoisted(() => ({ consultar: vi.fn(), solicitar: vi.fn(), aprobar: vi.fn(), warning: vi.fn(), error: vi.fn(),
  success: vi.fn(), orgListo: true }));
vi.mock('@/lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' }, effectiveRole: 'admin_org' }) }));
vi.mock('@/hooks/shared/useOrgFilter', () => ({ useOrgFilter: () => ({ organizationId: 'org-1', orgListo: m.orgListo }) }));
vi.mock('../../services/aprobacionMargen', () => ({ consultarAprobacionMargen: m.consultar, solicitarAprobacionMargen: m.solicitar, aprobarMargen: m.aprobar }));
vi.mock('@/lib/ui/appFeedback', () => ({ notifyWarning: m.warning, notifyError: m.error, notifySuccess: m.success }));
const snapshot = { venta: 9800, costo: 9445, margen_pct: 3.62, minimo_pct: 9, moneda: 'USD' as const,
  calculable: true, requiere_aprobacion: true };
const pendiente = { estado: 'pendiente', snapshot, puede_aprobar: true, solicitada_at: '2026-11-20', autorizada_at: null };
beforeEach(() => {
  vi.clearAllMocks(); m.orgListo = true; m.consultar.mockResolvedValue(pendiente);
  m.solicitar.mockResolvedValue(pendiente); m.aprobar.mockResolvedValue({ ...pendiente, estado: 'aprobada', autorizada_at: '2026-11-20' });
});
describe('aprobación del borrador', () => {
  it('no consulta importes hasta resolver la organización activa', () => {
    m.orgListo = false;
    renderHook(() => useAprobacionMargen('emb-1', true), { wrapper: createWrapper() });
    expect(m.consultar).not.toHaveBeenCalled();
  });
  it('tras aprobar mantiene el snapshot de 9800/9445 y lee el estado aprobado', async () => {
    const { result } = renderHook(() => useAprobacionMargen('emb-1', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { await result.current.mutation.mutateAsync({ snapshot, motivo: 'Caso especial autorizado' }); });
    expect(m.aprobar).toHaveBeenCalledExactlyOnceWith('emb-1', snapshot, 'Caso especial autorizado');
    await waitFor(() => expect(result.current.query.data?.estado).toBe('aprobada'));
    expect(result.current.query.data?.snapshot.costo).toBe(9445);
  });
  it('solicita por embarque, sin aprobarlo automáticamente', async () => {
    const { result } = renderHook(() => useAprobacionMargen('emb-1', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { await result.current.mutation.mutateAsync({}); });
    expect(m.solicitar).toHaveBeenCalledExactlyOnceWith('emb-1');
    expect(m.aprobar).not.toHaveBeenCalled();
    expect(result.current.query.data?.estado).toBe('pendiente');
  });
  it('un rechazo por importes obsoletos muestra aviso, no error del sistema', async () => {
    m.aprobar.mockRejectedValue({ code: '40001', message: 'LC_EMBARQUE_MARGEN_CONFLICTO: cambiaron los importes' });
    const { result } = renderHook(() => useAprobacionMargen('emb-1', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { await expect(result.current.mutation.mutateAsync({ snapshot, motivo: 'Caso especial autorizado' })).rejects.toMatchObject({ code: '40001' }); });
    expect(m.warning).toHaveBeenCalledOnce(); expect(m.error).not.toHaveBeenCalled();
    expect(result.current.query.data?.estado).toBe('pendiente');
  });
  it('errores desconocidos no se ocultan como rechazos funcionales', async () => {
    m.solicitar.mockRejectedValue(new Error('Error de red desconocido'));
    const { result } = renderHook(() => useAprobacionMargen('emb-1', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => { await expect(result.current.mutation.mutateAsync({})).rejects.toThrow('Error de red desconocido'); });
    expect(m.error).toHaveBeenCalledOnce(); expect(m.warning).not.toHaveBeenCalled();
  });
});
