/**
 * Tests P2 cierre (v13.296.0) — PlantillaSelectorPaso1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PlantillaSelectorPaso1 } from "@/features/cotizacion/components/wizard/PlantillaSelectorPaso1";
import { supabase } from "@/integrations/supabase/client";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const state = {
  plantillas: [] as Array<{
    id: string;
    nombre: string;
    descripcion: string | null;
    veces_usada: number;
    visibilidad: string;
  }>,
  rpcData: null as unknown,
};

vi.mock("@/integrations/supabase/client", () => {
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() =>
      Promise.resolve({ data: state.plantillas, error: null }),
    );
    return chain;
  });
  const rpc = vi.fn(() => Promise.resolve({ data: state.rpcData, error: null }));
  return { supabase: { from, rpc } };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeForm(origen = "") {
  return {
    getValues: vi.fn((campo?: string) => campo === "origen" ? origen : { ruta: "", origen, destino: "México" }),
    getFieldState: vi.fn((campo: string) => ({ isDirty: campo === "origen" && Boolean(origen) })),
    formState: { isDirty: Boolean(origen) },
    reset: vi.fn(),
    trigger: vi.fn(() => Promise.resolve(true)),
  } as any;
}

describe("PlantillaSelectorPaso1 (P2 cierre)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.plantillas = [];
    state.rpcData = null;
  });

  it("no renderiza si no hay organizationId", () => {
    const { container } = render(
      <PlantillaSelectorPaso1 organizationId={null} form={makeForm()} />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("no renderiza cuando la lista de plantillas está vacía", async () => {
    const { container } = render(
      <PlantillaSelectorPaso1 organizationId="org-1" form={makeForm()} />,
      { wrapper },
    );
    // Espera a que la query resuelva y colapse el nodo.
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("limita el panel al espacio disponible y devuelve el foco al selector con Escape", async () => {
    state.plantillas = [{
      id: "p1", nombre: "Plantilla de ejemplo", descripcion: null, veces_usada: 0, visibilidad: "org",
    }];
    const form = makeForm();
    render(<PlantillaSelectorPaso1 organizationId="org-1" form={form} />, { wrapper });

    const trigger = await screen.findByRole("button", { name: "Elegir plantilla" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Plantillas de cotización" })).toHaveClass(
      "max-w-[calc(100vw-1rem)]", "max-h-[var(--radix-popover-content-available-height)]",
    );
    expect(screen.getByRole("listbox")).toHaveClass("min-h-0", "overflow-y-auto");
    const buscar = screen.getByPlaceholderText("Buscar plantilla…");
    await waitFor(() => expect(buscar).toHaveFocus());
    fireEvent.keyDown(buscar, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByPlaceholderText("Buscar plantilla…")).not.toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("aplica plantilla → form.reset + trigger + onApplied", async () => {
    state.plantillas = [
      {
        id: "p1",
        nombre: "Shanghai → MZLO",
        descripcion: null,
        veces_usada: 3,
        visibilidad: "org",
      },
    ];
    state.rpcData = { version: 1, values: { ruta: "SHA-MZLO" } };
    const form = makeForm();
    const onApplied = vi.fn();

    render(
      <PlantillaSelectorPaso1
        organizationId="org-1"
        form={form}
        onApplied={onApplied}
      />,
      { wrapper },
    );

    // Espera a que aparezca el CTA (después de que carga la lista).
    const trigger = await screen.findByRole("button", { name: /elegir plantilla/i });
    fireEvent.click(trigger);

    const item = await screen.findByText("Shanghai → MZLO");
    fireEvent.click(item);

    await waitFor(() => expect(form.reset).toHaveBeenCalledTimes(1));
    const [values, opts] = form.reset.mock.calls[0];
    expect(values).toMatchObject({ ruta: "SHA-MZLO" });
    expect(opts).toEqual({ keepDefaultValues: true });
    expect(form.trigger).toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalled();
  });

  it("protege el origen escrito antes de aplicar una plantilla", async () => {
    const payload = { version: 1, values: { origen: "Puerto existente" } };
    state.plantillas = [Object.assign({
      id: "p1", nombre: "Plantilla de ejemplo", descripcion: null, veces_usada: 0, visibilidad: "org",
    }, { payload })];
    state.rpcData = payload;
    const form = makeForm("Puerto capturado");
    // Algunos inputs controlados de ruta usan setValue sin shouldDirty.
    form.getFieldState.mockReturnValue({ isDirty: false });
    form.formState = { isDirty: false, defaultValues: { origen: "", destino: "México" } };
    render(<PlantillaSelectorPaso1 organizationId="org-1" form={form} plantillaId="p1" />, { wrapper });
    const cta = await screen.findByRole("button", { name: "Aplicar Plantilla de ejemplo" });
    fireEvent.click(cta);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Origen");
    fireEvent.click(screen.getByRole("button", { name: "Conservar captura" }));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(form.reset).not.toHaveBeenCalled();
    fireEvent.click(cta);
    fireEvent.click(await screen.findByRole("button", { name: /^Aplicar plantilla$/ }));
    await waitFor(() => expect(form.reset).toHaveBeenCalledWith(
      expect.objectContaining({ origen: "Puerto existente", destino: "México" }),
      { keepDefaultValues: true },
    ));
  });

  it("muestra la plantilla pedida y usa su ID sólo al confirmar, aunque haya nombres iguales", async () => {
    state.plantillas = ["p1", "p2"].map((id) => ({
      id, nombre: "Ruta marítima", descripcion: null, veces_usada: 3, visibilidad: "org",
    }));
    state.rpcData = { version: 1, values: { ruta: "SHA-MZLO" } };
    const form = makeForm();
    render(<PlantillaSelectorPaso1 organizationId="org-1" form={form} plantillaId="p2" />, { wrapper });

    const confirmar = await screen.findByRole("button", { name: "Aplicar Ruta marítima" });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(form.reset).not.toHaveBeenCalled();
    fireEvent.click(confirmar);
    await waitFor(() => expect(form.reset).toHaveBeenCalledOnce());
    expect(supabase.rpc).toHaveBeenCalledWith("aplicar_plantilla_cotizacion", { _plantilla_id: "p2" });
    await waitFor(() => expect(confirmar).not.toBeInTheDocument());
  });
});
