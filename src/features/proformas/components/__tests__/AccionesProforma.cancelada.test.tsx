import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccionesProforma } from "../AccionesProforma";
import { RevisionConsolidacionProforma } from "../detalle/RevisionConsolidacionProforma";
import { makeProforma } from "@/test/fixtures";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import type { ProformaDetalleFull } from "../../services";

const aprobarAjuste = vi.fn();
vi.mock("../../hooks/useConsolidacionProforma", () => ({
  useAprobarAjusteConsolidacion: () => ({ puedeAprobar: true, aprobar: aprobarAjuste, isPending: false }),
}));

vi.mock("@/hooks/shared", () => ({ usePermissions: () => ({ canEmitirFactura: true, canResponderProformaManual: true, canEditarProforma: true }) }));
vi.mock("@/features/proformas/hooks/useConvertirProformaDirecto", () => ({ useConvertirProformaDirecto: () => ({ convertir: vi.fn() }) }));
vi.mock("@/features/proformas/hooks/useAprobarProformaInterna", () => ({ useAprobarProformaInterna: () => ({ aprobar: vi.fn() }) }));
vi.mock("@/features/cliente/hooks/useClienteAutorizacion", () => ({ useClienteAutorizacion: () => ({ autorizacion: { requiereAutorizacionProforma: false } }) }));
vi.mock("@/features/cliente/hooks/useValidarLimiteCredito", () => ({ useValidarLimiteCredito: () => vi.fn(), registrarExcesoCredito: vi.fn() }));
vi.mock("@/features/proformas/components/EnviarProformaDialog", () => ({ EnviarProformaDialog: () => null }));
vi.mock("@/features/proformas/components/RespuestaClienteManualDialog", () => ({ RespuestaClienteManualDialog: () => null }));
vi.mock("@/features/proformas/components/AlertaLimiteCreditoDialog", () => ({ AlertaLimiteCreditoDialog: () => null }));
vi.mock("@/features/proformas/components/RefacturarProformaAccion", () => ({ RefacturarProformaAccion: () => null }));
vi.mock("@/components/shared/BadgeClienteDeCasa", () => ({ BadgeClienteDeCasa: () => null }));
vi.mock("@/components/shared/DetalleActionBar", () => ({ DetalleActionBar: ({ primary, secondary }: { primary: { label: string } | null; secondary: { id: string; label: string }[] }) => <>{primary && <button>{primary.label}</button>}{secondary.map(i => <button key={i.id}>{i.label}</button>)}</> }));

describe("detalle histórico cancelado", () => {
  it.each(["pendiente", "aceptada"])("mantiene PDF sin enviar, aprobar o facturar (%s)", estado_cliente => {
    const proforma = { id: "history", estado_proforma: "cancelada", estado_cliente, factura_id: null } as ProformaDetalleFull;
    render(<AccionesProforma proforma={proforma} downloadingId={null} onDescargar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar al cliente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprobar internamente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Crear borrador de factura" })).toBeNull();
    expect(screen.queryByText(/Aprueba internamente para continuar/)).toBeNull();
  });
});

describe("revisión de proforma fiscal consolidada", () => {
  it("muestra ambos importes y autoriza el ajuste con la huella guardada", () => {
    const fiscal = fiscalCotizacionFixture({ cliente_id: "pm-qa" });
    const proforma: ProformaDetalleFull = {
      ...makeProforma({
        id: "consolidada", organization_id: fiscal.organization_id, cliente_id: "pm-qa",
        es_consolidada: true, estado_proforma: "pendiente", estado_cliente: "pendiente",
        ajuste_consolidacion_aprobado_at: null,
        evaluacion_fiscal: { ...fiscal, ajustes_consolidacion: [
          { moneda: "MXN", anterior: 230.40, nuevo: 230.42, diferencia: .02 },
        ] },
      }),
      facturas: null, facturas_asociadas: [], cliente_full: null, embarque_full: null, envios: [],
    };
    const vista = render(
      <>
        <AccionesProforma proforma={proforma} downloadingId={null} onDescargar={vi.fn()} />
        <RevisionConsolidacionProforma proforma={proforma} />
      </>,
    );
    expect(screen.getByText(/230\.40/)).toBeInTheDocument();
    expect(screen.getByText(/230\.42/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar al cliente/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar ajuste" }));
    expect(aprobarAjuste).toHaveBeenCalledWith({ proformaId: proforma.id, huella: fiscal.conceptos_fingerprint });
    const aprobada = { ...proforma, ajuste_consolidacion_aprobado_at: "2026-11-15T18:00:00Z" };
    vista.rerender(
      <>
        <AccionesProforma proforma={aprobada} downloadingId={null} onDescargar={vi.fn()} />
        <RevisionConsolidacionProforma proforma={aprobada} />
      </>,
    );
    expect(screen.getByText("Ajuste aprobado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar al cliente/ })).toBeInTheDocument();
  });
});
