import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

import { Input } from "./input"

interface StockQuantityInputProps {
  id?: string
  value?: number
  onValueChange: (value: number | undefined) => void
  placeholder?: string
  className?: string
  minValue?: number
  maxValue?: number
  disabled?: boolean
}

/**
 * Formata número inteiro com separador de milhares (pt-BR)
 * 1234 → "1.234"
 * 50000 → "50.000"
 */
const formatWithThousandsSeparator = (value: number): string => {
  return new Intl.NumberFormat("pt-BR").format(value)
}

/**
 * Processa entrada de quantidade com validação de inteiro positivo
 * Extrai apenas dígitos e valida mínimo e máximo
 */
const processStockInput = (input: string, minValue: number = 1, maxValue?: number) => {
  // Extrai apenas dígitos
  let digits = input.replace(/\D/g, "")

  if (!digits) {
    return { displayValue: "", numericValue: undefined }
  }

  // Limitar a 9 dígitos (máximo ~999 milhões)
  if (digits.length > 9) {
    digits = digits.substring(0, 9)
  }

  const numericValue = parseInt(digits, 10)

  // Validar máximo se fornecido
  if (maxValue !== undefined && numericValue > maxValue) {
    return { displayValue: digits, numericValue: undefined }
  }

  // Validar mínimo
  if (numericValue < minValue) {
    return { displayValue: digits, numericValue: undefined }
  }

  // Adicionar separador de milhares para exibição
  const displayValue = formatWithThousandsSeparator(numericValue)

  return {
    displayValue,
    numericValue,
  }
}

export function StockQuantityInput({
  id,
  value,
  onValueChange,
  placeholder = "1",
  className,
  minValue = 1,
  maxValue,
  disabled,
}: StockQuantityInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [displayValue, setDisplayValue] = useState("")

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    const char = e.key

    // Bloquear qualquer coisa que não seja dígito ou teclas de controle
    const isDigit = /\d/.test(char)
    const isControlKey = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(char)

    if (!isDigit && !isControlKey) {
      e.preventDefault()
      return
    }

    // Se é um dígito e tem maxValue, validar se ultrapassaria o limite
    if (isDigit && maxValue !== undefined) {
      const currentDigits = displayValue.replace(/\D/g, "")
      const newValue = parseInt(currentDigits + char, 10)

      // Se o novo valor ultrapassaria o máximo, bloquear
      if (newValue > maxValue) {
        e.preventDefault()
      }
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value

    // Processa entrada com validação de inteiro e separador
    const { displayValue: newDisplayValue, numericValue } = processStockInput(rawInput, minValue, maxValue)

    // Atualizar estado para rerender
    setDisplayValue(newDisplayValue)

    // Notificar parent com valor numérico PURO (sem separadores)
    onValueChange(numericValue)
  }

  const handleBlur = () => {
    // Garantir formatação com separadores ao sair do campo
    if (displayValue) {
      const digits = displayValue.replace(/\D/g, "")
      const { displayValue: formattedDisplay, numericValue } = processStockInput(digits, minValue, maxValue)

      if (numericValue !== undefined) {
        setDisplayValue(formattedDisplay)
      } else {
        setDisplayValue("")
      }
    }
  }

  const handleFocus = () => {
    // Remover separadores para edição limpa
    const digits = displayValue.replace(/\D/g, "")
    setDisplayValue(digits)
  }

  // Sincroniza com a prop `value` sempre que ela mudar externamente (ex: o
  // form pai resetando o campo pra undefined depois de salvar, ou
  // preenchendo pra editar um registro existente). Sem isso o campo ficava
  // com o número antigo na tela mesmo depois do form pai já ter zerado o
  // valor real.
  useEffect(() => {
    if (value === undefined) {
      setDisplayValue("")
      return
    }

    const currentDigits = displayValue.replace(/\D/g, "")
    const currentNumeric = currentDigits ? parseInt(currentDigits, 10) : undefined
    if (currentNumeric !== value) {
      setDisplayValue(formatWithThousandsSeparator(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      value={displayValue}
      maxLength={13} // "999.999.999" = 11 chars + buffer
      onKeyPress={handleKeyPress}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={cn(className)}
      disabled={disabled}
    />
  )
}
