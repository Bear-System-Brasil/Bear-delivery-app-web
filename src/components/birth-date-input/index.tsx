import { Calendar } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isCompleteDateFormat, maskBirthDate } from "@/utils";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
  /** Mensagem da regra (getBirthDateError). */
  error?: string | null;
  /**
   * Por padrão o erro só aparece com a data completa, para não acusar
   * "data incompleta" a cada dígito. true mostra mesmo incompleta (ex.: depois
   * de tentar salvar).
   */
  showIncompleteError?: boolean;
  className?: string;
};

/**
 * Campo de data de nascimento do cadastro e do perfil (LDMF-303): teclado
 * numérico e máscara dd/mm/aaaa enquanto digita, no lugar do seletor nativo,
 * que obriga a rolar dezenas de anos no celular.
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
    error && (showIncompleteError || isCompleteDateFormat(value)) ? error : null;

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
          onChange={(e) => onChange(maskBirthDate(e.target.value))}
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
