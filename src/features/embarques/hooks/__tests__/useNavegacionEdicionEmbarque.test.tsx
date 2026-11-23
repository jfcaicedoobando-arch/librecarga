import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { useTabsParam } from "@/hooks/shared/useTabsParam";
import { useVolver } from "@/hooks/shared/useVolver";
import { EmbarqueWizardLayout } from "../../components/EmbarqueWizardLayout";
import { useDestinoEdicionEmbarque, useVolverAlDetalleEmbarque } from "../useNavegacionEdicionEmbarque";

const LISTADO = "/embarques?estado=Confirmado&sort=eta&dir=asc&page=2";
const EMBARQUE_ID = "emb-prueba";
const DETALLE = `/embarques/${EMBARQUE_ID}`;
const TABS = ["resumen", "costos"] as const;
const STEPS = [{ num: 1, title: "Datos" }, { num: 2, title: "Ruta" }, { num: 3, title: "Costos" }];

function Detalle() {
  const { state } = useLocation();
  const volver = useVolver("/embarques");
  const { setActiveTab } = useTabsParam(TABS, "resumen", "tab", undefined, state);
  const destinoEdicion = useDestinoEdicionEmbarque(EMBARQUE_ID);
  const destinoCostos = useDestinoEdicionEmbarque(EMBARQUE_ID, 3);
  return (
    <>
      <DetailHeader backTo={volver} backLabel="Volver a Embarques" title="Detalle" />
      <button type="button" onClick={() => setActiveTab("costos")}>Ver costos</button>
      <Link {...destinoEdicion}>Editar</Link>
      <Link {...destinoCostos}>Cargar costos</Link>
    </>
  );
}

function Edicion() {
  const volver = useVolverAlDetalleEmbarque(EMBARQUE_ID);
  const [params] = useSearchParams();
  const [paso, setPaso] = useState(Number(params.get("step") || 1));
  const [borrador, setBorrador] = useState("");
  return (
    <EmbarqueWizardLayout
      title="Editar embarque" subtitle="Prueba" steps={STEPS}
      currentStep={paso} setCurrentStep={setPaso} totalSteps={STEPS.length}
      isPending={false} saveLabel="Guardar cambios" isDirty={borrador !== ""}
      onBack={volver} onFinish={volver}
    >
      <input aria-label="Borrador" value={borrador} onChange={(e) => setBorrador(e.target.value)} />
    </EmbarqueWizardLayout>
  );
}

function montar(path: string) {
  window.history.replaceState(null, "", path);
  render(
    <BrowserRouter>
      <Routes>
        <Route path="/embarques" element={<Link to={DETALLE}>Abrir embarque</Link>} />
        <Route path={DETALLE} element={<Detalle />} />
        <Route path={`${DETALLE}/editar`} element={<Edicion />} />
      </Routes>
    </BrowserRouter>,
  );
}

describe("Retorno de edición de embarque", () => {
  it("Cancelar restaura el detalle y Volver recupera los filtros, orden y página", async () => {
    montar(LISTADO);
    fireEvent.click(screen.getByRole("link", { name: "Abrir embarque" }));
    fireEvent.click(screen.getByRole("link", { name: "Editar" }));
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    fireEvent.click(cancelar);
    fireEvent.click(cancelar);
    fireEvent.click(await screen.findByRole("link", { name: "Volver a Embarques" }));
    expect(await screen.findByRole("link", { name: "Abrir embarque" })).toBeVisible();
    expect(window.location.pathname + window.location.search).toBe(LISTADO);
  });

  it("conserva el paso de entrada y pide confirmación antes de salir con cambios", async () => {
    montar(LISTADO);
    fireEvent.click(screen.getByRole("link", { name: "Abrir embarque" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver costos" }));
    fireEvent.click(screen.getByRole("link", { name: "Cargar costos" }));
    expect(window.location.search).toBe("?step=3");
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Paso 2 de 3 · Ruta")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Borrador" }), { target: { value: "Cambios pendientes" } });
    fireEvent.click(screen.getByRole("button", { name: /^Volver$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Seguir capturando" }));
    expect(screen.getByRole("textbox", { name: "Borrador" })).toHaveValue("Cambios pendientes");
    fireEvent.click(screen.getByRole("button", { name: /^Volver$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Salir sin guardar" }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`${DETALLE}?tab=costos`));
  });

  it("desde un enlace directo conserva el regreso al listado incluso al cambiar de pestaña", async () => {
    montar(`${DETALLE}/editar`);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver costos" }));
    expect(window.location.search).toBe("?tab=costos");
    fireEvent.click(screen.getByRole("link", { name: "Volver a Embarques" }));
    expect(await screen.findByRole("link", { name: "Abrir embarque" })).toBeVisible();
    expect(window.location.pathname + window.location.search).toBe("/embarques");
  });
});
