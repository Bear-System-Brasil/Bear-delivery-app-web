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
    companySpecialties: [{ id: "s1", name: "Pizzaria" }],
    specialtyDraft: ["s1", "", ""],
    hasSpecialtyChanges: false,
    isSavingSpecialty: false,
    setSpecialtySlot: vi.fn(),
    discardSpecialtyChanges: vi.fn(),
    handleSaveSpecialties: vi.fn(),
    handleSaveProfile: vi.fn(),
    handleCancelEdit: vi.fn(),
    setIsEditing: vi.fn(),
    updateFormField: vi.fn(),
    addresses: [] as unknown[],
    storeAddress: {
      id: "a1",
      street: "Rua Machado de Assis",
      number: "300",
      neighborhood: "Centro",
      city: "Castelo",
      state: "ES",
      zipCode: "29360000",
      isDefault: true,
    } as Record<string, unknown> | null,
    isAddressModalOpen: false,
    isSavingAddress: false,
    editingAddressId: "a1" as string | null,
    openAddressModal: vi.fn(),
    closeAddressModal: vi.fn(),
    handleSaveAddress: vi.fn(),
    addressEditor: {} as Record<string, unknown>,
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
      copyHours: vi.fn(),
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
    specialties: {
      data: [
        { id: "s1", name: "Pizzaria" },
        { id: "s2", name: "Hamburgueria" },
        { id: "s3", name: "Japonesa" },
        { id: "s4", name: "Açaí" },
      ],
    },
  };
});

vi.mock("@/hooks/use-company-profile-management", () => ({
  MAX_SPECIALTIES: 3,
  useCompanyProfileManagement: () => h.profile,
}))
vi.mock("@/hooks/use-opening-hours", () => ({
  useCompanyOpeningHours: () => h.hours,
}))
vi.mock("@/hooks/use-company-accepted-payment-methods", () => ({
  useCompanyAcceptedPaymentMethods: () => h.payments,
}))
vi.mock("@/hooks/use-specialties", () => ({
  useSpecialties: () => h.specialties,
}))

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
// O modal tem testes próprios; aqui só importa com que props a tela o abre.
const deliveryForm = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
vi.mock("@/components/profile/delivery-form", () => ({
  DeliveryForm: (props: Record<string, unknown>) => {
    deliveryForm(props);
    return <div role="dialog">modal de endereço</div>;
  },
}));

const storeAddressFixture = h.profile.storeAddress;

const sectionOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.profile.isEditing = false;
  h.profile.isChangingPassword = false;
  h.profile.companySpecialties = [{ id: "s1", name: "Pizzaria" }];
  h.profile.specialtyDraft = ["s1", "", ""];
  h.profile.hasSpecialtyChanges = false;
  h.profile.storeAddress = storeAddressFixture;
  h.profile.isAddressModalOpen = false;
  h.profile.editingAddressId = "a1";
});

/** Abre o select do slot (combobox) para que as opções apareçam. */
function openSlot(slotLabel: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: slotLabel }), {
    key: "Enter",
  });
}

describe("Perfil da Empresa - layout novo", () => {
  it("mostra as cinco seções com título e subtítulo", () => {
    render(<CompanyProfilePage />);

    for (const [title, subtitle] of [
      ["Informações da Empresa", "Dados fiscais e de contato"],
      ["Horário de Funcionamento", "Dias e horários em que a loja aceita pedidos"],
      ["Formas de Pagamento", "O checkout só oferece ao cliente as formas marcadas"],
      ["Endereço da Empresa", "O endereço da loja define o raio de entrega"],
      ["Segurança", "Alterar sua senha de acesso"],
    ]) {
      const section = sectionOf(title);
      // Card estreito mostra o subtítulo embaixo do título, sem o "·".
      expect(
        within(section).getByText(new RegExp(`^(· )?${subtitle}$`)),
      ).toBeInTheDocument();
    }
  });

  it("tem a seção própria de tipo de restaurante com três campos", () => {
    render(<CompanyProfilePage />);
    const section = sectionOf("Tipo de restaurante");

    expect(within(section).getByText("até 3 — o que o cliente vê no app"));
    expect(within(section).getAllByRole("combobox")).toHaveLength(3);
    // O tipo já escolhido aparece no 1º campo e como etiqueta no resumo.
    expect(within(section).getByRole("combobox", { name: "1º tipo" }))
      .toHaveTextContent("Pizzaria");
    expect(screen.getAllByText("Pizzaria").length).toBeGreaterThanOrEqual(2);
  });

  it("escolher num campo altera o rascunho (não salva na hora)", () => {
    render(<CompanyProfilePage />);
    openSlot("2º tipo");
    fireEvent.click(screen.getByRole("option", { name: "Hamburgueria" }));

    // Mexe só no rascunho do campo; não dispara salvamento.
    expect(h.profile.setSpecialtySlot).toHaveBeenCalledWith(1, "s2");
    expect(h.profile.handleSaveSpecialties).not.toHaveBeenCalled();
  });

  it('"— Remover —" esvazia o campo no rascunho', () => {
    render(<CompanyProfilePage />);
    openSlot("1º tipo");
    fireEvent.click(screen.getByRole("option", { name: "— Remover —" }));

    expect(h.profile.setSpecialtySlot).toHaveBeenCalledWith(0, "");
  });

  it("sem mudanças, a barra global não aparece e a seção não tem Salvar próprio (LDMF-464)", () => {
    render(<CompanyProfilePage />);

    // A barra global de salvar só aparece quando há mudança pendente.
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).not.toBeInTheDocument();
    // As 3 seções de campo não têm mais Salvar/Descartar próprios.
    const section = sectionOf("Tipo de restaurante");
    expect(
      within(section).queryByRole("button", { name: "Salvar" }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Descartar" }),
    ).not.toBeInTheDocument();
  });

  it("com mudança numa seção, a barra global salva e descarta essa seção (LDMF-464)", () => {
    h.profile.hasSpecialtyChanges = true;
    render(<CompanyProfilePage />);

    // 1 seção suja: a barra aparece com a contagem.
    expect(screen.getByText("1 alteração não salva")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(h.profile.handleSaveSpecialties).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(h.profile.discardSpecialtyChanges).toHaveBeenCalledTimes(1);
  });

  it("não repete nos outros campos o tipo já escolhido no rascunho", () => {
    render(<CompanyProfilePage />);
    // Pizzaria (s1) está no 1º campo do rascunho, então some como opção no 2º.
    openSlot("2º tipo");
    expect(
      screen.queryByRole("option", { name: "Pizzaria" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Hamburgueria" })).toBeInTheDocument();
  });

  it("o teto de 3 é estrutural: só há 3 campos, e um 4º tipo entra por troca", () => {
    h.profile.specialtyDraft = ["s1", "s2", "s3"];
    render(<CompanyProfilePage />);
    const section = sectionOf("Tipo de restaurante");
    // Nunca há um 4º campo para passar de três.
    expect(within(section).getAllByRole("combobox")).toHaveLength(3);
    // O 4º tipo (Açaí) entra trocando um existente no mesmo campo.
    openSlot("1º tipo");
    fireEvent.click(screen.getByRole("option", { name: "Açaí" }));
    expect(h.profile.setSpecialtySlot).toHaveBeenCalledWith(0, "s4");
  });

  it("sem especialidades no servidor, avisa e não mostra campos nem Salvar", () => {
    h.specialties.data = [];
    render(<CompanyProfilePage />);
    const section = sectionOf("Tipo de restaurante");

    expect(
      within(section).getByText(
        "Nenhum tipo de restaurante cadastrado no sistema ainda.",
      ),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Salvar" }),
    ).not.toBeInTheDocument();
    h.specialties.data = [
      { id: "s1", name: "Pizzaria" },
      { id: "s2", name: "Hamburgueria" },
      { id: "s3", name: "Japonesa" },
      { id: "s4", name: "Açaí" },
    ];
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

  it("a barra global dispara cada seção suja de forma independente (LDMF-464)", () => {
    h.hours.hasChanges = true;
    h.payments.hasChanges = true;
    render(<CompanyProfilePage />);

    // Duas seções sujas: a barra conta as duas.
    expect(screen.getByText("2 alterações não salvas")).toBeInTheDocument();

    // Um clique dispara os handlers das duas seções (rotas independentes).
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(h.hours.handleSaveHours).toHaveBeenCalledTimes(1);
    expect(h.payments.handleSave).toHaveBeenCalledTimes(1);

    h.hours.hasChanges = false;
    h.payments.hasChanges = false;
  });

  it("horário é digitado em 24h, sem o seletor nativo de relógio (LDMF-351)", () => {
    render(<CompanyProfilePage />);
    const section = sectionOf("Horário de Funcionamento");

    const open = within(section).getByRole("textbox", { name: "Abertura de Segunda" });
    expect(open).toHaveValue("11:00");
    expect(open).toHaveAttribute("inputmode", "numeric");
    expect(section.querySelector('input[type="time"]')).toBeNull();

    fireEvent.change(open, { target: { value: "1" } });
    expect(h.hours.updateDay).toHaveBeenCalledWith(0, { openTime: "10:00" });
  });

  it("intervalo liga no + intervalo e sai no × (LDMF-351)", () => {
    render(<CompanyProfilePage />);
    const section = sectionOf("Horário de Funcionamento");

    expect(
      within(section).queryByRole("textbox", { name: "Início do intervalo de Segunda" }),
    ).toBeNull();
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar intervalo em Segunda" }),
    );
    expect(h.hours.updateDay).toHaveBeenCalledWith(0, { hasBreak: true });
  });

  it("× tira o intervalo limpando as duas pontas", () => {
    const original = h.hours.hours;
    h.hours.hours = [{ ...original[0], breakStart: "15:00", breakEnd: "16:00" }];
    render(<CompanyProfilePage />);
    const section = sectionOf("Horário de Funcionamento");

    expect(
      within(section).getByRole("textbox", { name: "Início do intervalo de Segunda" }),
    ).toHaveValue("15:00");
    fireEvent.click(
      within(section).getByRole("button", { name: "Tirar intervalo de Segunda" }),
    );
    expect(h.hours.updateDay).toHaveBeenCalledWith(0, {
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    });
    h.hours.hours = original;
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

  describe("endereço da loja (LDMF-263)", () => {
    it("mostra só o endereço da loja, sem Adicionar outro nem Excluir", () => {
      render(<CompanyProfilePage />);
      const section = sectionOf("Endereço da Empresa");

      expect(within(section).getByText("Rua Machado de Assis, 300")).toBeInTheDocument();
      expect(within(section).queryByRole("button", { name: /Adicionar/ })).toBeNull();
      expect(within(section).queryByRole("button", { name: "Excluir endereço" })).toBeNull();
    });

    it("Editar abre o modal", () => {
      render(<CompanyProfilePage />);

      fireEvent.click(
        within(sectionOf("Endereço da Empresa")).getByRole("button", {
          name: "Editar endereço",
        }),
      );

      expect(h.profile.openAddressModal).toHaveBeenCalledTimes(1);
    });

    it("sem endereço, Adicionar Endereço abre o modal", () => {
      h.profile.storeAddress = null;
      render(<CompanyProfilePage />);
      const section = sectionOf("Endereço da Empresa");

      expect(within(section).getByText("Nenhum endereço cadastrado")).toBeInTheDocument();
      fireEvent.click(within(section).getByRole("button", { name: /Adicionar Endereço/ }));

      expect(h.profile.openAddressModal).toHaveBeenCalledTimes(1);
    });

    it("modal fechado não é renderizado", () => {
      render(<CompanyProfilePage />);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(deliveryForm).not.toHaveBeenCalled();
    });

    it("modal aberto: mesmo modal do cliente, com Referência, sem caixa de padrão e texto de loja", () => {
      h.profile.isAddressModalOpen = true;
      render(<CompanyProfilePage />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(deliveryForm).toHaveBeenLastCalledWith(
        expect.objectContaining({
          handleAddAddress: h.profile.handleSaveAddress,
          handleCloseAddressModal: h.profile.closeAddressModal,
          isEditing: true,
          showReference: true,
          showDefaultOption: false,
          placeLabel: "sua loja",
        }),
      );
    });
  });
});
