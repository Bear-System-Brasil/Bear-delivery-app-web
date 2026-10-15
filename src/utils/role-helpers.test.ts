import { describe, expect, it } from "vitest";
import {
  canRemoveStaffMember,
  getProfileRoute,
  isClientRole,
  isCompanyAdminRole,
  isCompanyStaffRole,
  isManagementRole,
} from "./role-helpers";

describe("isCompanyStaffRole", () => {
  it("reconhece qualquer role de staff do restaurante", () => {
    expect(isCompanyStaffRole("owner")).toBe(true);
    expect(isCompanyStaffRole("manager")).toBe(true);
    expect(isCompanyStaffRole("financial")).toBe(true);
    expect(isCompanyStaffRole("cook")).toBe(true);
    expect(isCompanyStaffRole("delivery")).toBe(true);
  });

  it("não reconhece cliente nem valor vazio", () => {
    expect(isCompanyStaffRole("client")).toBe(false);
    expect(isCompanyStaffRole(undefined)).toBe(false);
  });
});

describe("isCompanyAdminRole", () => {
  it("só reconhece quem administra o cadastro da empresa", () => {
    expect(isCompanyAdminRole("owner")).toBe(true);
    expect(isCompanyAdminRole("admin")).toBe(true);
  });

  it("staff que não é admin fica de fora (manager, financial, cook, delivery)", () => {
    expect(isCompanyAdminRole("manager")).toBe(false);
    expect(isCompanyAdminRole("financial")).toBe(false);
    expect(isCompanyAdminRole("cook")).toBe(false);
    expect(isCompanyAdminRole("delivery")).toBe(false);
    expect(isCompanyAdminRole(undefined)).toBe(false);
  });
});

describe("isClientRole", () => {
  it("reconhece os sinônimos de cliente", () => {
    expect(isClientRole("client")).toBe(true);
    expect(isClientRole("customer")).toBe(true);
    expect(isClientRole("user")).toBe(true);
  });

  it("não reconhece staff nem valor vazio", () => {
    expect(isClientRole("owner")).toBe(false);
    expect(isClientRole(undefined)).toBe(false);
  });
});

describe("getProfileRoute", () => {
  it("manda quem administra a empresa para /company-profile", () => {
    expect(getProfileRoute("owner")).toBe("/company-profile");
    expect(getProfileRoute("admin")).toBe("/company-profile");
  });

  it("manda o restante (staff não-admin e clientes) para /profile", () => {
    expect(getProfileRoute("manager")).toBe("/profile");
    expect(getProfileRoute("financial")).toBe("/profile");
    expect(getProfileRoute("client")).toBe("/profile");
    expect(getProfileRoute(undefined)).toBe("/profile");
  });
});

describe("isManagementRole", () => {
  it("reconhece owner, admin e manager", () => {
    expect(isManagementRole("owner")).toBe(true);
    expect(isManagementRole("admin")).toBe(true);
    expect(isManagementRole("manager")).toBe(true);
  });

  it("deixa de fora financial, cook, delivery, cliente e valor vazio", () => {
    expect(isManagementRole("financial")).toBe(false);
    expect(isManagementRole("cook")).toBe(false);
    expect(isManagementRole("delivery")).toBe(false);
    expect(isManagementRole("client")).toBe(false);
    expect(isManagementRole(undefined)).toBe(false);
  });
});

describe("canRemoveStaffMember", () => {
  it("não permite remover a si mesmo independente da role", () => {
    expect(canRemoveStaffMember({ id: "u-1", role: "owner" }, { id: "u-1", role: "owner" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-1", role: "admin" }, { id: "u-1", role: "admin" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-1", role: "manager" }, { id: "u-1", role: "manager" })).toBe(false);
  });

  it("não permite remover o proprietário (owner)", () => {
    expect(canRemoveStaffMember({ id: "u-admin", role: "admin" }, { id: "u-owner", role: "owner" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-mgr", role: "manager" }, { id: "u-owner", role: "owner" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-owner-2", role: "owner" }, { id: "u-owner", role: "owner" })).toBe(false);
  });

  it("owner pode remover qualquer cargo da equipe", () => {
    const owner = { id: "u-owner", role: "owner" };
    expect(canRemoveStaffMember(owner, { id: "u-mgr", role: "manager" })).toBe(true);
    expect(canRemoveStaffMember(owner, { id: "u-cook", role: "cook" })).toBe(true);
    expect(canRemoveStaffMember(owner, { id: "u-del", role: "delivery" })).toBe(true);
    expect(canRemoveStaffMember(owner, { id: "u-fin", role: "financial" })).toBe(true);
  });

  it("admin pode remover gerentes e equipe operacional, mas não outros admins", () => {
    const admin = { id: "u-admin", role: "admin" };
    expect(canRemoveStaffMember(admin, { id: "u-admin-2", role: "admin" })).toBe(false);
    expect(canRemoveStaffMember(admin, { id: "u-mgr", role: "manager" })).toBe(true);
    expect(canRemoveStaffMember(admin, { id: "u-cook", role: "cook" })).toBe(true);
    expect(canRemoveStaffMember(admin, { id: "u-del", role: "delivery" })).toBe(true);
    expect(canRemoveStaffMember(admin, { id: "u-fin", role: "financial" })).toBe(true);
  });

  it("manager pode remover equipe operacional, mas não gerentes nem admins", () => {
    const manager = { id: "u-mgr", role: "manager" };
    expect(canRemoveStaffMember(manager, { id: "u-admin", role: "admin" })).toBe(false);
    expect(canRemoveStaffMember(manager, { id: "u-mgr-2", role: "manager" })).toBe(false);
    expect(canRemoveStaffMember(manager, { id: "u-cook", role: "cook" })).toBe(true);
    expect(canRemoveStaffMember(manager, { id: "u-del", role: "delivery" })).toBe(true);
    expect(canRemoveStaffMember(manager, { id: "u-fin", role: "financial" })).toBe(true);
  });

  it("demais papéis (cook, delivery, financial, client) não podem remover ninguém", () => {
    for (const role of ["cook", "delivery", "financial", "client"]) {
      expect(canRemoveStaffMember({ id: "u-x", role }, { id: "u-cook", role: "cook" })).toBe(false);
    }
  });

  it("retorna false se usuário atual ou alvo estiver incompleto ou nulo", () => {
    expect(canRemoveStaffMember(null, { id: "u-1", role: "cook" })).toBe(false);
    expect(canRemoveStaffMember(undefined, { id: "u-1", role: "cook" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-1" }, { id: "u-2", role: "cook" })).toBe(false);
    expect(canRemoveStaffMember({ id: "u-1", role: "owner" }, null)).toBe(false);
    expect(canRemoveStaffMember({ id: "u-1", role: "owner" }, { id: "", role: "cook" })).toBe(false);
  });
});

