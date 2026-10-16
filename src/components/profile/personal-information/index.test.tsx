import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PersonalInformation } from "./index";
import { useForm } from "react-hook-form";
import type { ProfileFormData } from "@/hooks";
import { useProfileForm } from "@/hooks/use-form-validation";
import { BIRTH_DATE_MESSAGES } from "@/utils";
import type { User } from "@/stores/auth-store";

const mockUser: User = {
  id: "user-123",
  name: "João Silva",
  email: "joao@exemplo.com",
  cpf: "123.456.789-00",
  phone: "(11) 98765-4321",
  birthDate: "1990-05-15",
  role: "client",
};

function TestWrapper({
  isOpen = false,
  handleCancelEdit = vi.fn(),
  handleSaveProfile = vi.fn(),
  open = vi.fn(),
  isPending = false,
}) {
  const form = useForm<ProfileFormData>({
    defaultValues: {
      name: mockUser.name || "",
      email: mockUser.email || "",
      cpf: mockUser.cpf || "",
      phone: mockUser.phone || "",
      birthDate: "15/05/1990",
    },
  });

  const editingState = {
    isOpen,
    toggle: vi.fn(),
    open,
    close: vi.fn(),
    setIsOpen: vi.fn(),
  };

  const updateProfile = {
    isPending,
    isError: false,
    reset: vi.fn(),
  } as any;

  return (
    <PersonalInformation
      handleCancelEdit={handleCancelEdit}
      handleSaveProfile={handleSaveProfile}
      updateProfile={updateProfile}
      profileForm={form}
      editingState={editingState}
      user={mockUser}
    />
  );
}

describe("PersonalInformation Component", () => {
  it("renderiza os campos em modo de visualização com email desabilitado e data formatada", () => {
    render(<TestWrapper isOpen={false} />);

    expect(screen.getByText("Informações Pessoais")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/nome completo/i);
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue("João Silva");

    const emailInput = screen.getByLabelText(/email \(não editável\)/i);
    expect(emailInput).toBeDisabled();
    expect(emailInput).toHaveValue("joao@exemplo.com");

    const birthDateInput = screen.getByLabelText(/data de nascimento/i);
    expect(birthDateInput).toBeDisabled();
    // Exibição formatada em DD/MM/YYYY
    expect(birthDateInput).toHaveValue("15/05/1990");
  });

  it("ao clicar em Editar, chama a ação de abrir edição", () => {
    const openMock = vi.fn();
    render(<TestWrapper isOpen={false} open={openMock} />);

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(openMock).toHaveBeenCalled();
  });

  it("em modo de edição, exibe botões Cancelar e Salvar e email continua desabilitado", () => {
    const cancelMock = vi.fn();
    render(<TestWrapper isOpen={true} handleCancelEdit={cancelMock} />);

    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();

    // Email NUNCA pode ser editado pelo usuário
    const emailInput = screen.getByLabelText(/email \(não editável\)/i);
    expect(emailInput).toBeDisabled();

    // Data de nascimento usa o mesmo campo do cadastro, não o seletor nativo
    const birthDateInput = screen.getByLabelText(/data de nascimento/i);
    expect(birthDateInput).not.toBeDisabled();
    expect(birthDateInput).toHaveAttribute("type", "text");
    expect(birthDateInput).toHaveAttribute("inputmode", "numeric");

    // Cancelar chama o callback correspondente
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(cancelMock).toHaveBeenCalled();
  });
});


function ValidatedWrapper({ birthDate = "15/05/1990", handleSaveProfile = vi.fn() }) {
  const form = useProfileForm({
    name: mockUser.name,
    email: mockUser.email,
    cpf: mockUser.cpf,
    phone: mockUser.phone,
    birthDate,
  });
  const editingState = {
    isOpen: true,
    toggle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    setIsOpen: vi.fn(),
  };
  const updateProfile = {
    isPending: false,
    isError: false,
    reset: vi.fn(),
  } as unknown as ComponentProps<typeof PersonalInformation>["updateProfile"];

  return (
    <PersonalInformation
      handleCancelEdit={vi.fn()}
      handleSaveProfile={handleSaveProfile}
      updateProfile={updateProfile}
      profileForm={form}
      editingState={editingState}
      user={mockUser}
    />
  );
}

describe("PersonalInformation - data de nascimento (LDMF-303)", () => {
  it("aplica a máscara dd/mm/aaaa enquanto digita", () => {
    render(<ValidatedWrapper />);
    const input = screen.getByLabelText(/data de nascimento/i);

    fireEvent.change(input, { target: { value: "151" } });
    expect(input).toHaveValue("15/1");

    fireEvent.change(input, { target: { value: "15102000" } });
    expect(input).toHaveValue("15/10/2000");
  });

  it("mostra no próprio campo o erro de menor de 18 e não salva", async () => {
    const save = vi.fn();
    render(<ValidatedWrapper handleSaveProfile={save} />);
    const input = screen.getByLabelText(/data de nascimento/i);

    fireEvent.change(input, {
      target: { value: `0101${new Date().getFullYear() - 10}` },
    });

    expect(await screen.findByText(BIRTH_DATE_MESSAGES.underage)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(save).not.toHaveBeenCalled());
  });

  it("mostra erro de data inexistente e de data futura", async () => {
    render(<ValidatedWrapper />);
    const input = screen.getByLabelText(/data de nascimento/i);

    // 31/02 digitado nem entra: o campo fica como estava
    fireEvent.change(input, { target: { value: "" } });
    for (const ch of "3102") {
      fireEvent.change(input, { target: { value: (input as HTMLInputElement).value + ch } });
    }
    expect(input).toHaveValue("31/0");

    // 29/02 de ano comum colado entra e mostra o aviso
    (input as HTMLInputElement).setSelectionRange(0, (input as HTMLInputElement).value.length);
    fireEvent.paste(input, { clipboardData: { getData: () => "29/02/2001" } });
    expect(input).toHaveValue("29/02/2001");
    expect(await screen.findByText(BIRTH_DATE_MESSAGES.invalid)).toBeInTheDocument();

    fireEvent.change(input, {
      target: { value: `0101${new Date().getFullYear() + 1}` },
    });
    expect(await screen.findByText(BIRTH_DATE_MESSAGES.future)).toBeInTheDocument();
  });

  it("não acusa data incompleta enquanto digita, só depois de tentar salvar", async () => {
    const save = vi.fn();
    render(<ValidatedWrapper handleSaveProfile={save} />);
    const input = screen.getByLabelText(/data de nascimento/i);

    fireEvent.change(input, { target: { value: "1510" } });
    expect(screen.queryByText(BIRTH_DATE_MESSAGES.incomplete)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    expect(await screen.findByText(BIRTH_DATE_MESSAGES.incomplete)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("data válida de adulto salva normalmente", async () => {
    const save = vi.fn();
    render(<ValidatedWrapper handleSaveProfile={save} />);

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ birthDate: "15/05/1990" });
  });
});
