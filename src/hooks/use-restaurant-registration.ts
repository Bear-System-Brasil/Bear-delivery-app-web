import { apiService } from '@/services/api'
import { useAuthStore } from '@/stores'
import { getBirthDateError, onlyNumbers } from '@/utils'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface SubmitMessage {
  type: 'success' | 'error'
  text: string
}

interface RestaurantFormData {
  tradeName: string
  legalName: string
  cnpj: string
  email: string
  password: string
  confirmPassword: string
  phone: string
  description: string
  // Data de nascimento do dono (LDMF-422): a conta é de uma pessoa, e o back
  // exige a data e recusa menor de 18. Só usada ao criar conta nova.
  birthDate: string
}

/**
 * Hook para gerenciar registro de restaurante
 * Inclui: validação de formulário, senha, submissão
 */
export const useRestaurantRegistration = () => {
  const router = useRouter()

  // Logado como cliente, a empresa é criada na própria conta (LDMF-295):
  // sem POST /auth/register, que criaria outra conta e hoje falha sem CPF
  // (LDMF-291). POST /company aceita client e promove a conta pra owner
  // (company.md). Outra role já é staff ou dono - não cadastra por aqui.
  const authUser = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const storeLogout = useAuthStore((state) => state.logout)
  const isLoggedIn = isAuthenticated && !!authUser
  const canRegisterOnAccount = isLoggedIn && authUser?.role === 'client'
  const [isLoading, setIsLoading] = useState(false)
  const [registerData, setRegisterData] = useState<RestaurantFormData>({
    tradeName: '',
    legalName: '',
    cnpj: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    description: '',
    birthDate: '',
  })

  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [passwordMatch, setPasswordMatch] = useState(true)
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null)

  // Contato da empresa começa com o da conta - dá pra trocar, a doc só exige
  // que exista (company.md: email e phone obrigatórios).
  useEffect(() => {
    if (!canRegisterOnAccount || !authUser) return
    setRegisterData((prev) => ({
      ...prev,
      email: prev.email || (authUser.email ?? '').toLowerCase(),
      phone: prev.phone || (authUser.phone ?? ''),
    }))
  }, [canRegisterOnAccount, authUser])

  /**
   * Valida requisitos de senha
   */
  const validatePassword = (password: string): string[] => {
    const errors: string[] = []

    if (password.length < 6) errors.push('mínimo 6 caracteres')
    if (!/[A-Z]/.test(password)) errors.push('1 letra maiúscula')
    if (!/[a-z]/.test(password)) errors.push('1 letra minúscula')
    if (!/\d/.test(password)) errors.push('1 número')
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('1 símbolo')

    return errors
  }

/**
   * Atualiza campo do formulário
   */
  const handleInputChange = (field: keyof RestaurantFormData, value: string) => {
    // 1. Normaliza o valor ANTES de atualizar o estado
    const normalizedValue = field === "email" ? value.toLowerCase() : value;

    setRegisterData((prev) => {
      // 2. Usa o normalizedValue aqui em vez do value bruto
      const newData = { ...prev, [field]: normalizedValue }
      
      if (field === 'password') {
        setPasswordErrors(validatePassword(normalizedValue))
      }

      if (field === 'confirmPassword' || (field === 'password' && prev.confirmPassword)) {
        const passwordToCompare = field === 'password' ? normalizedValue : prev.password
        const confirmPasswordToCompare = field === 'confirmPassword' ? normalizedValue : prev.confirmPassword
        setPasswordMatch(passwordToCompare === confirmPasswordToCompare)
      }

      return newData
    })
  }

  /**
   * Processa mensagem de erro do backend
   */
  const parseErrorMessage = (message: unknown): string => {
    // Trata a mensagem de erro de forma robusta
    let errorMessage: string

    if (typeof message === 'string' && message.trim()) {
      errorMessage = message
    } else if (Array.isArray(message) && message.length > 0) {
      // Se for array, pega o primeiro elemento
      const firstMsg = message[0]
      errorMessage = typeof firstMsg === 'string' ? firstMsg : JSON.stringify(firstMsg)
    } else if (message && typeof message === 'object') {
      // Se for objeto, tenta converter para string legível
      const msgObj = message as Record<string, unknown>
      if (typeof msgObj.message === 'string') {
        errorMessage = msgObj.message
      } else {
        // Última tentativa: converte objeto para JSON legível
        try {
          const jsonStr = JSON.stringify(msgObj, null, 2)
          errorMessage = `Erro ao cadastrar: ${jsonStr}`
        } catch (e) {
          errorMessage = 'Erro ao cadastrar restaurante. Verifique os dados e tente novamente.'
        }
      }
    } else {
      errorMessage = 'Erro ao cadastrar restaurante. Tente novamente.'
    }

    // Traduz algumas mensagens comuns do backend
    const lowerMsg = errorMessage.toLowerCase()
    if (lowerMsg.includes('already exists') || lowerMsg.includes('já existe') || lowerMsg.includes('unique')) {
      errorMessage = 'Este email, CNPJ ou telefone já está cadastrado no sistema.'
    } else if (lowerMsg.includes('cnpj')) {
      // Só quando o erro é do CNPJ: antes qualquer "invalid" (telefone,
      // e-mail) virava "CNPJ inválido", e o texto citava um botão "Gerar
      // CNPJ" que não existe na tela.
      errorMessage = 'CNPJ inválido. Verifique o número digitado.'
    }

    return errorMessage
  }

  /**
   * Submete formulário de registro
   */
  const buildCompanyPayload = () => ({
    tradeName: registerData.tradeName,
    legalName: registerData.legalName,
    description: registerData.description || registerData.tradeName,
    actionRadius: "10",
    cnpj: onlyNumbers(registerData.cnpj),
    email: registerData.email,
    phone: onlyNumbers(registerData.phone),
  })

  const createCompanyOnAccount = async () => {
    setIsLoading(true)
    try {
      const response = await apiService.companies.create(buildCompanyPayload())

      if (!response.success) {
        setSubmitMessage({ type: 'error', text: parseErrorMessage(response.message) })
        return
      }

      // O token não é renovado: a conta virou owner no banco, mas a sessão
      // ainda diz client, sem companyId (company.md). Sai e pede login de
      // novo - é o que faz o painel do restaurante aparecer.
      setSubmitMessage({
        type: 'success',
        text: 'Restaurante cadastrado! Entre de novo na sua conta para acessar o painel do restaurante.',
      })
      storeLogout()
      void apiService.logout()
      setTimeout(() => router.push('/?openAuth=true'), 2000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao cadastrar restaurante. Tente novamente.'
      setSubmitMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitMessage(null)

    if (isLoggedIn) {
      if (!canRegisterOnAccount) {
        setSubmitMessage({
          type: 'error',
          text: 'Sua conta já está ligada a um restaurante. Para cadastrar outro, use uma conta de cliente.',
        })
        return
      }
      await createCompanyOnAccount()
      return
    }

    if (passwordErrors.length > 0) {
      setSubmitMessage({ type: 'error', text: 'Por favor, atenda todos os requisitos de senha.' })
      return
    }

    if (!passwordMatch) {
      setSubmitMessage({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }

    // A conta é do dono, uma pessoa: o back exige a data e recusa menor de
    // 18 (LDMF-422). Trava aqui pra dar a mensagem certa antes do POST.
    const birthDateError = getBirthDateError(registerData.birthDate)
    if (birthDateError) {
      setSubmitMessage({ type: 'error', text: birthDateError })
      return
    }

    setIsLoading(true)

    try {
      const cleanPhone = onlyNumbers(registerData.phone)

      // Step 1: Register user account via POST /auth/register
      // Sem `role` de propósito: a conta nasce como 'client' (padrão do
      // backend) e POST /company (passo 2) exige exatamente client ou owner
      // - é essa chamada que promove a role pra 'owner' no banco (ver
      // company.md). Mandar 'owner' já aqui no registro não é o fluxo
      // documentado e quebra o cadastro.
      const registerResponse = await apiService.register({
        name: registerData.tradeName,
        email: registerData.email,
        phone: cleanPhone,
        password: registerData.password,
        birthDate: registerData.birthDate,
      })

      if (!registerResponse.success || !registerResponse.data) {
        const errorMessage = parseErrorMessage(registerResponse.message)
        setSubmitMessage({ type: 'error', text: errorMessage })
        return
      }

      // Step 2: Create company via POST /company. A sessão já foi criada
      // como cookie httpOnly pelo /api/auth/register - o proxy injeta o
      // Bearer sozinho na próxima chamada.
      const companyPayload = buildCompanyPayload()

      const companyResponse = await apiService.companies.create(companyPayload)

      if (companyResponse.success) {
        setSubmitMessage({
          type: 'success',
          text: 'Conta de restaurante criada com sucesso! Redirecionando para login...',
        })

        setTimeout(() => {
          router.push('/?openAuth=true')
        }, 2000)
      } else {
        // User was created but company failed — let the user know
        const errorMessage = parseErrorMessage(companyResponse.message)
        setSubmitMessage({
          type: 'error',
          text: `Conta criada, mas houve um erro ao cadastrar a empresa: ${errorMessage}. Faça login e tente novamente pelo painel.`,
        })
        setTimeout(() => router.push('/?openAuth=true'), 3000)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao cadastrar restaurante. Tente novamente.'
      setSubmitMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Verifica se formulário é válido
   */
  const hasCompanyFields =
    registerData.tradeName &&
    registerData.legalName &&
    registerData.cnpj &&
    registerData.email &&
    registerData.phone

  // Logado, não há senha: a conta já existe.
  const isFormValid = isLoggedIn
    ? Boolean(hasCompanyFields) && canRegisterOnAccount
    : Boolean(
        hasCompanyFields &&
          registerData.password &&
          registerData.confirmPassword &&
          passwordErrors.length === 0 &&
          passwordMatch &&
          !getBirthDateError(registerData.birthDate),
      )

  return {
    // Conta logada (LDMF-295)
    isLoggedIn,
    canRegisterOnAccount,
    accountLabel: authUser?.email || authUser?.name || '',

    // Form data
    registerData,
    handleInputChange,

    // Validation
    passwordErrors,
    passwordMatch,
    isFormValid,

    // Submit
    isLoading,
    submitMessage,
    handleSubmit,
  }
}
