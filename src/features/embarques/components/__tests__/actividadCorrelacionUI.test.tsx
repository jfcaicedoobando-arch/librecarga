import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { useState } from 'react';
import { TabNotas } from '../TabNotas';
import { TrackingNuevoEventoForm } from '../tracking/TrackingNuevoEventoForm';
import { ActividadItem } from '../ActividadItem';
import { createWrapper } from '@/test/utils/queryWrapper';
import { useBorradorNotaEmbarque } from '../../hooks/useBorradorNotaEmbarque';

const m = vi.hoisted(() => ({ nota: vi.fn(), audit: vi.fn(), rpc: vi.fn(), close: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc } }));
vi.mock('@/hooks/shared', () => ({ usePermissions: () => ({ canEdit: true }), useRegistrarActividad: () => ({ mutate: m.audit }) }));
vi.mock('@/lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { email: 'coordinador@example.com' } }) }));
vi.mock('../../hooks/mutations/useNotaEmbarque', () => ({
  useCreateNotaEmbarque: () => ({ mutateAsync: m.nota }),
}));
vi.mock('@/features/embarques/hooks', () => ({
  useActividadEmbarque: () => ({ grupos: [], conteos: {}, categoria: 'todos', setCategoria: vi.fn(), items: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../tracking/ActualizarEtaForm', () => ({ ActualizarEtaForm: ({ onSubmit }: { onSubmit: (v: { fecha: string; fuente: string }) => Promise<void> }) => <button onClick={() => void onSubmit({ fecha: '2026-11-20', fuente: 'Agente Ningbo' })}>Guardar ETA mock</button> }));
vi.mock('@/lib/ui/appFeedback', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const id = '22222222-2222-4222-8222-222222222222';

function DetalleNota({ embarqueId }: { embarqueId: string }) {
  const { guardDialog, ...borrador } = useBorradorNotaEmbarque(embarqueId, 'ELIMP00011');
  const [mostrarNotas, setMostrarNotas] = useState(true);
  return (
    <>
      {guardDialog}
      <Link to="/embarques">Volver a Embarques</Link>
      <button onClick={() => setMostrarNotas(!mostrarNotas)}>{mostrarNotas ? 'Ver resumen' : 'Ver notas'}</button>
      {mostrarNotas && <TabNotas embarqueId={embarqueId} {...borrador} />}
    </>
  );
}

function detalle(embarqueId = 'e1') {
  return (
    <MemoryRouter initialEntries={['/embarques/e1']}>
      <Routes>
        <Route path="/embarques/:id" element={<DetalleNota embarqueId={embarqueId} />} />
        <Route path="/embarques" element={<h1>Embarques</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.nota.mockResolvedValue(id);
  m.rpc.mockImplementation(async (_name, args) => ({ data: args.p_request_id, error: null }));
});
describe('correlación desde los callers reales', () => {
  it('la bitácora de UI usa el ID confirmado de la nota', async () => {
    render(detalle());
    const campo = screen.getByPlaceholderText('Escribe una nota…');
    fireEvent.change(campo, { target: { value: 'Cita de entrega en Apodaca' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' })); });
    await vi.waitFor(() => expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ detalles: { nota: 'Cita de entrega en Apodaca', notaId: id } })));
    expect(campo).toHaveValue('');
  });

  it('conserva el nuevo borrador escrito durante el guardado de la nota anterior', async () => {
    let resolverNota!: (notaId: string) => void;
    m.nota.mockReturnValueOnce(new Promise<string>((resolve) => { resolverNota = resolve; }));
    render(detalle());
    const campo = screen.getByPlaceholderText('Escribe una nota…');
    fireEvent.change(campo, { target: { value: ' Cita de entrega en Apodaca ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));
    expect(campo).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enviar nota' })).toBeDisabled();
    fireEvent.change(campo, { target: { value: 'Confirmar horario de recibo' } });

    await act(async () => { resolverNota(id); });
    expect(m.nota).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ contenido: 'Cita de entrega en Apodaca' }));
    expect(m.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      detalles: { nota: 'Cita de entrega en Apodaca', notaId: id },
    }));
    expect(campo).toHaveValue('Confirmar horario de recibo');
  });

  it('conserva el borrador entre pestañas y pide confirmación al salir del detalle', () => {
    render(detalle());
    fireEvent.change(screen.getByRole('textbox', { name: 'Nueva nota del embarque' }), { target: { value: 'Pendiente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Volver a Embarques' }));
    expect(screen.getByRole('alertdialog', { name: '¿Salir sin guardar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir capturando' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver notas' }));
    expect(screen.getByRole('textbox')).toHaveValue('Pendiente');

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Embarques' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    expect(screen.getByRole('heading', { name: 'Embarques' })).toBeVisible();
    expect(m.nota).not.toHaveBeenCalled();
  });

  it('conserva el borrador si el envío falla tras volver a Notas', async () => {
    let rechazar!: (error: Error) => void;
    m.nota.mockReturnValueOnce(new Promise<string>((_, reject) => { rechazar = reject; }));
    render(detalle());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reintentar nota' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver notas' }));
    expect(screen.getByRole('button', { name: 'Enviar nota' })).toBeDisabled();
    await act(async () => { rechazar(new Error('Sin conexión')); });
    expect(screen.getByRole('textbox')).toHaveValue('Reintentar nota');
    expect(screen.getByRole('button', { name: 'Enviar nota' })).toBeEnabled();
  });

  it('aísla los borradores y la respuesta de un envío entre embarques', async () => {
    let resolver!: (notaId: string) => void;
    m.nota.mockReturnValueOnce(new Promise<string>((resolve) => { resolver = resolve; }));
    const { rerender } = render(detalle());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sólo para e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));
    rerender(detalle('e2'));
    expect(screen.getByRole('textbox')).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nueva captura de e2' } });
    await act(async () => { resolver(id); });
    expect(screen.getByRole('textbox')).toHaveValue('Nueva captura de e2');
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ entidad_id: 'e1' }));
  });

  it('registra ETA y su evento con una sola operación', async () => {
    render(<TrackingNuevoEventoForm embarqueId="e1" etaActual="2026-11-18" onClose={m.close} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar ETA/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar ETA mock' })); });
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('registrar_evento_tracking_embarque', expect.objectContaining({
      p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/), p_embarque_id: 'e1',
      p_accion: 'eta', p_fecha: '2026-11-20', p_ubicacion: 'Agente Ningbo',
    }));
  });

  it('mantiene el formulario abierto y reutiliza el identificador si la respuesta se pierde', async () => {
    m.rpc.mockRejectedValueOnce(new Error('Se perdió la respuesta'));
    render(<TrackingNuevoEventoForm embarqueId="e1" onClose={m.close} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar ETA/ }));
    const guardar = screen.getByRole('button', { name: 'Guardar ETA mock' });
    await act(async () => { fireEvent.click(guardar); });
    expect(m.rpc).toHaveBeenCalledOnce();
    expect(m.close).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(guardar); });
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);
  });

  it('las transiciones de cotización no se rotulan como cambio del embarque', () => {
    render(<ul><ActividadItem item={{ id: 'bitc-1', categoria: 'comercial', tipo: 'bitacora', fecha: '2026-09-27T02:50:30Z', usuario: '', accion: 'cambiar_estado', titulo: 'Cotización: cambiar_estado', refTipo: 'cotizacion' }} /></ul>);
    expect(screen.getByText('Cambio de estado de la cotización')).toBeInTheDocument();
    expect(screen.queryByText(/estado del embarque/)).not.toBeInTheDocument();
  });

  it('permite consultar el JSON completo de las bitácoras relacionadas', () => {
    render(<ul><ActividadItem item={{ id: `nota-${id}`, categoria: 'operacion', tipo: 'nota', fecha: '2026-09-27T02:50:30Z', usuario: '', accion: 'Nota', titulo: 'Cita en Apodaca', relacionados: [{ id: 'bit-1', categoria: 'operacion', tipo: 'bitacora', fecha: '2026-09-27T02:50:30Z', usuario: '', accion: 'agregar_nota', titulo: 'Nota registrada', detalles: { notaId: id, usuario: 'Coordinación' } }] }} /></ul>);
    const summary = screen.getByText('Ver 1 registro relacionado');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    const tecnico = screen.getByText('Ver detalle técnico');
    fireEvent.click(tecnico);
    expect(tecnico.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(new RegExp(id))).toBeVisible();
  });
});
