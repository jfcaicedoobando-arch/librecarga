import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ejecutarGuardarEmbarque } from '../useEditarEmbarqueWizard.save';

const m = vi.hoisted(() => ({ consultar: vi.fn(), update: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(), assertCurrent: vi.fn() }));
vi.mock('../../services/aprobacionMargen', () => ({ consultarAprobacionMargen: m.consultar }));
vi.mock('@/lib/ui/appFeedback', () => ({ notifyError: m.notifyError, notifySuccess: m.notifySuccess }));
vi.mock('@/lib/auth/authOperationScope', () => ({ captureAuthDataScope: () => ({ assertCurrent: m.assertCurrent }) }));
vi.mock('../../services/evaluacionFiscalEmbarque', () => ({ prepararRevisionFiscalEmbarque: vi.fn() }));
type Deps = Parameters<typeof ejecutarGuardarEmbarque>[0];
function deps(estado = 'Borrador'): Deps {
  // Fixture mínima del guardado: el único cambio es costo/venta, no la ruta ni la revisión fiscal.
  return {
    id: 'emb-1', embarque: { id: 'emb-1', estado, cliente_id: 'cli-1', organization_id: 'org-1', updated_at: '2026-11-20' },
    methods: { getValues: (key?: string) => key === 'modo' ? 'Aéreo' : key === 'contenedores' ? [] : key ? null : {} },
    buildEmbarquePayload: () => ({ cliente_id: 'cli-1' }),
    buildConceptosVentaPayload: () => [{ descripcion: 'Flete', cantidad: 1, precio_unitario: 9800, moneda: 'USD' }],
    buildConceptosCostoPayload: () => [{ concepto: 'Flete', monto: 9445, moneda: 'USD' }],
    conceptosVenta: [{ cantidad: 1, precioUnitario: 9800, moneda: 'USD' }],
    conceptosCosto: [{ monto: 9445, moneda: 'USD' }],
    conceptosVentaDb: [], conceptosCostoDb: [], contactos: [], proveedoresDb: [],
    updateEmbarque: { mutateAsync: m.update }, registrarActividad: { mutate: vi.fn() },
    setCurrentStep: vi.fn(), navigate: vi.fn(), margenMinimoPct: 9, puedeAutorizarMargen: false,
    signal: new AbortController().signal, solicitarRevisionFiscal: vi.fn(),
  } as unknown as Deps;
}
beforeEach(() => {
  vi.clearAllMocks(); m.update.mockResolvedValue(undefined); m.consultar.mockResolvedValue({ estado: 'pendiente' });
});
describe('guardar borrador de 3.62% con mínimo 9%', () => {
  it('coordinación guarda si el servidor ya implementa la aprobación', async () => {
    const input = deps();
    await ejecutarGuardarEmbarque(input);
    expect(m.update).toHaveBeenCalledOnce();
    expect(m.update.mock.calls[0][0]).toMatchObject({ id: 'emb-1', expectedUpdatedAt: '2026-11-20' });
    expect(m.notifyError).not.toHaveBeenCalled();
    expect(input.navigate).toHaveBeenCalledWith('/embarques/emb-1');
  });
  it('sin candidata aplicada NO libera el candado de margen', async () => {
    m.consultar.mockResolvedValue(null);
    await ejecutarGuardarEmbarque(deps());
    expect(m.update).not.toHaveBeenCalled();
    expect(m.notifyError).toHaveBeenCalledWith(undefined, expect.objectContaining({ title: 'Requiere autorización comercial' }));
  });
  it('falla de red NO permite guardar ni asumir aprobación', async () => {
    m.consultar.mockRejectedValue(new Error('Fallo de red'));
    await ejecutarGuardarEmbarque(deps());
    expect(m.update).not.toHaveBeenCalled();
    expect(m.notifyError).toHaveBeenCalled();
  });
  it('un embarque operativo mantiene el candado anterior', async () => {
    await ejecutarGuardarEmbarque(deps('Confirmado'));
    expect(m.consultar).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it('cambio de organización antes de guardar cancela la mutación', async () => {
    m.assertCurrent.mockImplementationOnce(() => { throw new Error('Cambió la organización'); });
    await ejecutarGuardarEmbarque(deps());
    expect(m.update).not.toHaveBeenCalled();
  });
});
