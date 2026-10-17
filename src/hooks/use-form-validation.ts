import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { getBirthDateError } from "@/utils";

/**
 * Schemas de validação reutilizáveis
 */
export const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  cpf: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.replace(/\D/g, "").length === 11,
      "CPF deve ter 11 dígitos",
    ),
  phone: z.string().min(10, "Telefone deve ter pelo menos 10 dígitos"),
  // Mesma regra do cadastro (LDMF-303). Vazio continua aceito: nesse caso o
  // perfil não manda birthDate e a data salva no back fica como está.
  birthDate: z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (!value) return;
      const error = getBirthDateError(value);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
});

/** Valor salvo no número quando o cliente marca "Sem número". */
export const NO_NUMBER = "S/N";

export const NUMBER_MESSAGE = "Informe o número da casa ou marque Sem número";

/** O número é o "Sem número" (S/N)? */
export function isNoNumber(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase() === NO_NUMBER;
}

/** Dígitos com uma letra opcional: 12, 12A, 12 A, 12-B. */
const HOUSE_NUMBER = /^\d+(\s*-?\s*[a-z])?$/i;

export const addressSchema = z.object({
  type: z.string().optional(),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z
    .string()
    .refine(
      (value) => isNoNumber(value) || HOUSE_NUMBER.test(value.trim()),
      NUMBER_MESSAGE,
    ),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().min(2, "Estado é obrigatório"),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  zipCode: z.string().min(8, "CEP deve ter 8 dígitos"),
  isDefault: z.boolean().optional(),
});

export const loginSchema = z.object({
  phone: z.string().min(10, "Telefone deve ter pelo menos 10 dígitos"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type AddressFormData = z.infer<typeof addressSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Hooks específicos para formulários comuns
 */
export function useProfileForm(defaultValues?: Partial<ProfileFormData>) {
  return useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues,
    mode: "onChange",
  });
}

export function useAddressForm(defaultValues?: Partial<AddressFormData>) {
  return useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues,
    mode: "onChange",
  });
}

export function useLoginForm(defaultValues?: Partial<LoginFormData>) {
  return useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues,
    mode: "onChange",
  });
}
