import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompanyProfilePage from "./page";

/**
 * Testes de layout do Perfil da Empresa. O salvamento é dos hooks (que têm
 * testes próprios): aqui só se confere que cada seção aparece e que os
 * botões continuam ligados aos mesmos handlers.
 */

// Referências estáveis: objetos criados uma vez e só alterados entre testes.
// Mock com identidade nova a cada render causa laço infinito neste projeto.
const h = vi.hoisted(() => {
  const profile = {
    user: { id: "u1", companyId: "c1", role: "owner" },
    isMounted: true,
    isLoadingProfile: false,
    isLoadingAddresses: false,
    profileError: null as string | null,
    formData: {
      tradeName: "Pizza Brum",
      legalName: "Brum Pizza LTDA",
      cnpj: "67263374000170",
      email: "pizza@exemplo.com",
      phone: "28999920418",
      cover_url: "",
      logo_url: "",
    },
    isEditing: false,
    isSaving: false,
    selectedCategory: "s1",
    isSavingSpecialty: false,
    handleSaveProfile: vi.fn(),
    handleSaveSpecialty: vi.fn(),
    handleCancelEdit: vi.fn(),
    setIsEditing: vi.fn(),
    updateFormField: vi.fn(),
    setSelectedCategory: vi.fn(),
    addresses: [
      {
        id: "a1",
        street: "Rua Machado de Assis",
        number: "300",
        neighborhood: "Centro",
        city: "Castelo",
        state: "ES",
        zipCode: "29360000",
        isDefault: true,
      },
    ],
    newAddress: {},
    isAddingAddress: false,
    editingAddressId: null,
    setIsAddingAddress: vi.fn(),
    handleSaveAddress: vi.fn(),
    handleEditAddress: vi.fn(),
    handleCancelAddressEdit: vi.fn(),
    handleDeleteAddress: vi.fn(),
    handleSearchZipCode: vi.fn(),
    isSearchingZipCode: false,
    zipCodeHint: "",
    updateAddressField: vi.fn(),
    formatZipCode: (v: string) => v,
    passwordData: { currentPassword: "", newPassword: "", confirmPassword: "" },
    passwordErrors: [] as string[],
    isChangingPassword: false,
    setIsChangingPassword: vi.fn(),
    handleChangePassword: vi.fn(),
    updatePasswordField: vi.fn(),
    resetPasswordForm: vi.fn(),
  };
  const days = ["Segunda", "Terça"].map((label, i) => ({
    day: i,
    label,
    isOpen: i === 0,
    openTime: "11:00",
    closeTime: "18:00",
    breakStart: "",
    breakEnd: "",
  }));
  return {
    profile,
    hours: {
      hours: days,
      hasChanges: false,
      persistedDays: [] as number[],
      updateDay: vi.fn(),
      discardChanges: vi.fn(),
      handleSaveHours: vi.fn(),
      isSavingHours: false,
      isLoadingHours: false,
      isHoursError: false,
      hoursError: null,
      refetchHours: vi.fn(),
      isOpenNow: true,
      linkedToCashRegister: false,
    },
    payments: {
      selected: ["CASH"],
      hasChanges: false,
      toggleMethod: vi.fn(),
      discardChanges: vi.fn(),
      handleSave: vi.fn(),
      isSaving: false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    specialties: { data: [{ id: "s1", name: "Pizzaria" }] },
  };
});

vi.mock("@/hooks", () => ({
  useCompanyProfileManagement: () => h.profile,
  useCompanyOpeningHours: () => h.hours,
  useCompanyAcceptedPaymentMethods: () => h.payments,
  useSpecialties: () => h.specialties,
}));

vi.mock("@/components/protected-route", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/company-cover-upload", () => ({
  CompanyCoverUpload: () => <div>capa</div>,
}));
vi.mock("@/components/company-logo-upload", () => ({
  CompanyLogoUpload: () => <div>logo</div>,
}));

const sectionOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.profile.isEditing = false;
  h.profile.isChangingPassword = false;
});

describe("Perfil da Empresa - layout novo", () => {
  it("mostra as cinco seções com título e subtítulo", () => {
    render(<CompanyProfilePage />);

    for (const [title, subtitle] of [
      ["Informações da Empresa", "Dados fiscais e de contato"],
      ["Horário de Funcionamento", "Dias e horários em que a loja aceita pedidos"],
      ["Formas de Pagamento", "O checkout só oferece ao cliente as formas marcadas"],
      ["Endereço da Empresa", "O endereço padrão define o raio de entrega"],
      ["Segurança", "Alterar sua senha de acesso"],
    ]) {
      const section = sectionOf(title);
      expect(within(section).getByText(`· ${subtitle}`)).toBeInTheDocument();
    }
  });

  it("mostra o tipo de restaurante escolhido no resumo e no campo", () => {
    render(<CompanyProfilePage />);

    // Resumo do topo + valor do select da seção de informações.
    expect(screen.getAllByText("Pizzaria")).toHaveLength(2);
    expect(
      within(sectionOf("Informações da Empresa")).getByRole("combobox"),
    ).toHaveTextContent("Pizzaria");
  });

  it("Editar das informações continua no mesmo handler", () => {
    render(<CompanyProfilePage />);
    fireEvent.click(
      within(sectionOf("Informações da Empresa")).getByRole("button", {
        name: "Editar",
      }),
    );
    expect(h.profile.setIsEditing).toHaveBeenCalledWith(true);
  });

  it("com edição aberta, Salvar chama o salvamento das informações", () => {
    h.profile.isEditing = true;
    render(<CompanyProfilePage />);
    fireEvent.click(
      within(sectionOf("Informações da Empresa")).getByRole("button", {
        name: "Salvar",
      }),
    );
    expect(h.profile.handleSaveProfile).toHaveBeenCalledTimes(1);
  });

  it("Salvar do horário e das formas de pagamento seguem separados", () => {
    h.payments.hasChanges = true;
    render(<CompanyProfilePage />);

    fireEvent.click(
      within(sectionOf("Horário de Funcionamento")).getByRole("button", {
        name: "Salvar",
      }),
    );
    fireEvent.click(
      within(sectionOf("Formas de Pagamento")).getByRole("button", {
        name: "Salvar",
      }),
    );
    expect(h.hours.handleSaveHours).toHaveBeenCalledTimes(1);
    expect(h.payments.handleSave).toHaveBeenCalledTimes(1);
    h.payments.hasChanges = false;
  });

  it("Alterar Senha fica no cabeçalho da seção e abre o formulário", () => {
    render(<CompanyProfilePage />);
    fireEvent.click(
      within(sectionOf("Segurança")).getByRole("button", {
        name: "Alterar Senha",
      }),
    );
    expect(h.profile.setIsChangingPassword).toHaveBeenCalledWith(true);
  });

  it("endereço padrão aparece marcado e editar usa o handler de sempre", () => {
    render(<CompanyProfilePage />);
    const section = sectionOf("Endereço da Empresa");

    expect(within(section).getByText("Padrão")).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole("button", { name: "Editar endereço" }),
    );
    expect(h.profile.handleEditAddress).toHaveBeenCalledWith(
      h.profile.addresses[0],
    );
  });
});
