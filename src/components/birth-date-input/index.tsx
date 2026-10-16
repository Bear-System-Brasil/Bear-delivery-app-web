import type { ClipboardEvent } from "react";
import { Calendar } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BIRTH_DATE_MESSAGES,
  isCompleteDateFormat,
  maskBirthDate,
  nextBirthDateValue,
} from "@/utils";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
  /** Mensagem da regra (getBirthDateError) ou do back. */
  error?: string | null;
  /**
   * Por padrão "data incompleta" só aparece com a data completa, para não
   * acusar a cada dígito. true mostra mesmo incompleta (ex.: depois de tentar
   * salvar). Os outros erros aparecem sempre.
   */
  showIncompleteError?: boolean;
  className?: string;
};

/**
 * Campo de data de nascimento do cadastro e do perfil (LDMF-303).
 *
 * Teclado numérico, máscara dd/mm/aaaa e dígito impossível recusado na hora
 * (nextBirthDateValue), no lugar do seletor nativo, que obriga a rolar dezenas
 * de anos no celular.
 */
export function BirthDateInput({
  id,
  value,
  onChange,
  onBlur,
  name,
  disabled,
  error,
  showIncompleteError = false,
  className,
}: Props) {
  const visibleError =
    error &&
    (error !== BIRTH_DATE_MESSAGES.incomplete ||
      showIncompleteError ||
      isCompleteDateFormat(value))
      ? error
      : null;

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    // Colar tratado aqui: o maxLength do input cortaria um texto como
    // "Nascido em 15/10/2000" antes de chegar nos números.
    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const pasted = e.clipboardData.getData("text");
    onChange(maskBirthDate(value.slice(0, start) + pasted + value.slice(end)));
  };

  return (
    <>
      <div className="relative">
        <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          value={value}
          onChange={(e) => onChange(nextBirthDateValue(value, e.target.value))}
          onPaste={handlePaste}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={visibleError ? true : undefined}
          aria-describedby={visibleError ? `${id}-error` : undefined}
          className={cn(
            "pl-10 rounded-xl border-2 border-border focus:border-brand-400",
            visibleError && "border-red-500 focus:border-red-500",
            className,
          )}
        />
      </div>
      {visibleError && (
        <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400 mt-1">
          {visibleError}
        </p>
      )}
    </>
  );
}
