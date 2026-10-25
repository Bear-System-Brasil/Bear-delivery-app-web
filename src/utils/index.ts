// Utility functions
export * from './auth-helpers'
export * from './formatter'
// export * from './permissions' // Commented to avoid conflict with auth-helpers (isClient, isRestaurantStaff)
export * from './role-helpers'
export * from './time-input'

// Date utilities
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)
dayjs.locale('pt-br')

export { dayjs }

// Number formatters
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

// String utilities
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Extrai uma mensagem legivel de um `catch (error)` tipado como `unknown`.
 * Cobre `Error`, respostas de API com `{ message }` e strings soltas.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  if (typeof error === 'string') return error
  return fallback
}