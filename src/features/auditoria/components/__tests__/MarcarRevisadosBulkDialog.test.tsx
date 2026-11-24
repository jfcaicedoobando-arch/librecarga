import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarcarRevisadosBulkDialog } from "../MarcarRevisadosBulkDialog";
import { revisionKey } from "../../hooks/revisiones/hash";
import type { HallazgoAuditoria } from "../../types";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }));

vi.mock("@/features/auditoria/hooks/useMarcarRevisadosBulk", () => ({
  useMarcarRevisadosBulk: () => ({ ...mocks, isPending: false }),
}));

it("reintenta solo el hallazgo fallido, incluso cuando comparte expediente", async () => {
  const revisado: HallazgoAuditoria = {
    embarque_id: "emb-1",
    expediente: "EMB-QA",
    cliente_nombre: "Cliente QA",
    modo: "Marítimo",
    estado: "Confirmado",
    eta: null,
    regla: "fechas",
    severidad: "alto",
    detalle: "Validar ETA",
    documentos_faltantes: [],
  };
  const pendiente = { ...revisado, detalle: "Validar ETD" };
  mocks.mutateAsync.mockResolvedValueOnce({
    ok: 1,
    fail: 1,
    errores: [{ id: revisionKey(pendiente), expediente: pendiente.expediente, mensaje: "Fallo temporal" }],
  }).mockResolvedValueOnce({ ok: 1, fail: 0, errores: [] });
  const onSuccess = vi.fn();

  render(<MarcarRevisadosBulkDialog
    open hallazgos={[revisado, pendiente]} onOpenChange={vi.fn()} onSuccess={onSuccess}
  />);
  fireEvent.change(screen.getByRole("textbox", { name: /Acción tomada/ }), { target: { value: "Verificado" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar (2)" }));

  fireEvent.click(await screen.findByRole("button", { name: "Reintentar pendientes (1)" }));
  expect(mocks.mutateAsync).toHaveBeenNthCalledWith(1, {
    hallazgos: [revisado, pendiente], accionTomada: "Verificado",
  });
  expect(mocks.mutateAsync).toHaveBeenNthCalledWith(2, {
    hallazgos: [pendiente], accionTomada: "Verificado",
  });
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});
