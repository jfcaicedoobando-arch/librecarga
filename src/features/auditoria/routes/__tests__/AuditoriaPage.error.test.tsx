import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Auditoria from "../AuditoriaPage";

const mocks = vi.hoisted(() => ({ refetch: vi.fn(), tab: "ejecutivo" }));
vi.mock("@/features/auditoria/hooks", () => ({
  useAuditoriaPageController: () => ({
    isError: true,
    hallazgosFiltrados: [{ id: "dato-de-cache" }],
    refetch: mocks.refetch,
  }),
  useAuditoriaEjecutivo: () => ({}),
}));
vi.mock("@/hooks/shared/useTabsParam", () => ({ useTabsParam: () => ({ activeTab: mocks.tab }) }));
vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ isAdmin: true }),
  useDocumentTitle: () => undefined,
}));
vi.mock("@/features/auditoria/components/AuditoriaEjecutivoTab", () => ({
  AuditoriaEjecutivoTab: () => "Métricas del resumen",
}));
vi.mock("@/features/auditoria/components/AuditoriaHallazgosTab", () => ({
  AuditoriaHallazgosTab: () => "Listado de hallazgos",
}));
vi.mock("@/features/auditoria/components/AuditoriaPorReglaTab", () => ({
  AuditoriaPorReglaTab: () => "Resultados por regla",
}));

it.each(["ejecutivo", "tabla", "por_regla"])("muestra el error y conserva el reintento en %s", (tab) => {
  mocks.tab = tab;
  mocks.refetch.mockClear();
  render(<Auditoria />);

  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByRole("alert")).toHaveTextContent("No se pudo cargar la auditoría");
  expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  fireEvent.click(within(panel).getByRole("button", { name: "Reintentar" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});
