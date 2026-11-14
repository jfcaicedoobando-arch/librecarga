import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPorcentajesBroker } from "../brokers";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/services/userManagement/invoke", () => ({ invokeUserManagement: vi.fn() }));

describe("porcentaje KAM de brokers", () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }));

  it.each([null, 0, 12.5])("envía %s explícito sin convertirlo en el porcentaje normal", async (kam) => {
    await setPorcentajesBroker("broker-1", 25, kam);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("crm_broker_set_porcentajes", {
      p_broker_id: "broker-1", p_broker_pct: 25, p_kam_pct: kam,
    });
  });

  it("propaga el rechazo de permisos del servidor", async () => {
    const error = { code: "42501", message: "LC_BROKER_PCT_NO_AUTORIZADO" };
    rpc.mockResolvedValueOnce({ error });
    await expect(setPorcentajesBroker("broker-1", 25, null)).rejects.toBe(error);
  });
});
