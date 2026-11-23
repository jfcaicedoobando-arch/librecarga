import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import FacturapiOnboardingWizard from "../FacturapiOnboardingWizard";

const mocks = vi.hoisted(() => ({ probar: vi.fn(), guardar: vi.fn() }));

vi.mock("@/features/configuracion/hooks/useFacturapiCredenciales", () => ({
  useFacturapiCredenciales: () => ({ data: { ambiente: "sandbox", api_key_sandbox_last4: "0001", api_key_live_last4: "0002" } }),
  useProbarFacturapiConexion: () => ({ mutateAsync: mocks.probar, isPending: false }),
  useUpsertFacturapiCredenciales: () => ({ mutateAsync: mocks.guardar, isPending: false }),
}));
vi.mock("../wizard/PasoApiKeys", () => ({ PasoApiKeys: () => null }));

function siguiente() {
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
}

it("sólo permite finalizar con una prueba exitosa del ambiente elegido", async () => {
  let resolverSandbox!: (value: { ok: boolean; facturapi_org_id: string }) => void;
  const sandbox = new Promise((resolve) => { resolverSandbox = resolve; });
  mocks.probar.mockReturnValueOnce(sandbox).mockResolvedValueOnce({ ok: true, facturapi_org_id: "org-live" });
  mocks.guardar.mockResolvedValue(undefined);
  render(<FacturapiOnboardingWizard orgId="org-a" open onOpenChange={vi.fn()} />);
  siguiente();
  siguiente();
  fireEvent.click(screen.getByRole("button", { name: "Probar conexión" }));
  expect(mocks.probar).toHaveBeenCalledWith("sandbox");
  fireEvent.click(screen.getByRole("button", { name: /Atrás/ }));
  fireEvent.click(screen.getByRole("button", { name: /Atrás/ }));
  fireEvent.click(screen.getByRole("radio", { name: /Producción/ }));
  siguiente();
  siguiente();
  await act(async () => resolverSandbox({ ok: true, facturapi_org_id: "org-sandbox" }));
  expect(screen.getByRole("button", { name: /Finalizar/ })).toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Probar conexión" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Finalizar/ })));
  expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({ ambiente: "live", facturapi_org_id: "org-live" }));
});
