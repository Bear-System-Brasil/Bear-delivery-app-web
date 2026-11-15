import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCompanyProducts } from "./index";

const getProductsByCompany = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      getProductsByCompany: (...args: unknown[]) =>
        getProductsByCompany(...args),
    },
  };
});

describe("getCompanyProducts", () => {
  beforeEach(() => getProductsByCompany.mockReset());

  const produtos = [{ id: "p1" }, { id: "p2" }];

  it("devolve os itens do envelope { data, meta }", async () => {
    getProductsByCompany.mockResolvedValue({
      success: true,
      data: { data: produtos, meta: { page: 1, limit: 100, total: 2, totalPages: 1 } },
    });
    await expect(getCompanyProducts("c1")).resolves.toEqual(produtos);
  });

  it("aceita array cru, sem envelope, em vez de devolver undefined (LDMF-495)", async () => {
    getProductsByCompany.mockResolvedValue({ success: true, data: produtos });
    await expect(getCompanyProducts("c1")).resolves.toEqual(produtos);
  });
});
