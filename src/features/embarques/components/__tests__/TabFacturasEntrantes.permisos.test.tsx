import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TabFacturasEntrantes } from "@/features/embarques/components/TabFacturasEntrantes";
import type { FacturaEntranteRow } from "@/features/cxp/services";

/**
 * v13.489.0 — Segregación de funciones en el buzón del embarque: operaciones
 * entrega los PDF/XML del agente; contabilidad sólo consulta y captura después
 * la factura en CxP. Espejo de la política RLS de INSERT en
 * `embarque_facturas_entrantes`.
 */
const permisos = { isAdmin: false, canSubirFacturaEntranteEmbarque: false };
const consultaBuzon = {
  data: [] as FacturaEntranteRow[] | undefined,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

vi.mock("@/hooks/shared/usePermissions", () => ({
  usePermissions: () => permisos,
}));
vi.mock("@/hooks/shared/useOrgFilter", () => ({
  useOrgFilter: () => ({ organizationId: "org-1" }),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/features/cxp/hooks/useFacturasEntrantes", () => ({
  useFacturasEntrantes: () => consultaBuzon,
  useEliminarFacturaEntrante: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAdjuntarXmlFacturaEntrante: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubirFacturaEntrante: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivarFacturaEntrante: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// El diálogo de subida consulta costos del proveedor vía react-query.
const renderTab = (cerrado = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TabFacturasEntrantes embarqueId="e1" canEdit cerrado={cerrado} /></MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  permisos.isAdmin = false;
  permisos.canSubirFacturaEntranteEmbarque = false;
  consultaBuzon.data = [];
  consultaBuzon.isError = false;
  consultaBuzon.refetch.mockClear();
});

describe("<TabFacturasEntrantes /> permisos de subida", () => {
  it("operaciones ve el botón de subir factura", () => {
    permisos.canSubirFacturaEntranteEmbarque = true;
    renderTab();
    expect(screen.getByRole("button", { name: /subir factura/i })).toBeInTheDocument();
  });

  it("un rol contable no ve el botón y recibe la explicación", () => {
    renderTab();
    expect(screen.queryByRole("button", { name: /subir factura/i })).not.toBeInTheDocument();
    expect(screen.getByText(/la entrega de archivos la hace operaciones/i)).toBeInTheDocument();
  });

  it("embarque cerrado: operaciones no ve el botón y se le pide reabrir", () => {
    permisos.canSubirFacturaEntranteEmbarque = true;
    renderTab(true);
    expect(screen.queryByRole("button", { name: /subir factura/i })).not.toBeInTheDocument();
    expect(screen.getByText(/embarque cerrado\. pide a un administrador/i)).toBeInTheDocument();
  });
});

describe("<TabFacturasEntrantes /> consulta del buzón", () => {
  it("el error permite reintentar y omite el vacío y los contadores desconocidos", () => {
    consultaBuzon.data = undefined;
    consultaBuzon.isError = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el buzón de facturas");
    expect(screen.queryByText(/Aún no hay facturas de proveedor/)).not.toBeInTheDocument();
    expect(screen.queryByText("0 por capturar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(consultaBuzon.refetch).toHaveBeenCalledOnce();
  });

  it("una consulta vacía muestra el buzón vacío y sus contadores", () => {
    renderTab();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Aún no hay facturas de proveedor/)).toBeInTheDocument();
    expect(screen.getByText("0 por capturar")).toBeInTheDocument();
  });
});
