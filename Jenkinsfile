// Pipeline do Bear Delivery (frontend) — LDMF-470.
//
// Fluxo: valida tudo contra a `dev` e, só depois de um gate manual, promove
// pra `main`. A promoção é um merge fast-forward-friendly de dev -> main.
//
// Estágios: checkout -> install (pnpm) -> lint -> build -> unit (vitest)
//           -> e2e (Playwright contra o back de teste) -> gate manual
//           -> promove main.
//
// Credenciais (configurar no Jenkins, NUNCA no código):
//   - e2e-test-client  (Username with password): username = e-mail do cliente
//       de teste PRÉ-ATIVADO no back de teste; password = a senha dele.
//       Nunca usar a conta DeCasa.
//   - git-push-main    (Username with password / token): permissão de push na
//       `main`, usada só no estágio de promoção.
//
// Pré-requisitos do agente: Node 20+, git e as libs de sistema do Chromium
// (o estágio de e2e instala o browser do Playwright).

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    CI = 'true'
    PNPM_VERSION = '9'

    // Back de teste da dev. O roteamento de API do front é server-side (route
    // handlers do Next em /api/proxy e /api/auth), que leem API_URL em runtime
    // — por isso basta setar aqui, sem rebuild por ambiente.
    API_URL = 'https://like-delivery-backend.onrender.com'
    NEXT_PUBLIC_API_URL = 'https://like-delivery-backend.onrender.com'

    // E2E roda contra o build (next start), não o dev server.
    PLAYWRIGHT_PORT = '3100'
    E2E_WEBSERVER_CMD = './node_modules/.bin/next start -p 3100'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git --no-pager log -1 --oneline'
      }
    }

    stage('Install (pnpm)') {
      steps {
        // pnpm via corepack, travado no lockfile pra build reproduzível.
        sh '''
          corepack enable
          corepack prepare pnpm@${PNPM_VERSION} --activate
          pnpm --version
          pnpm install --frozen-lockfile
        '''
      }
    }

    stage('Lint') {
      steps {
        sh 'pnpm lint'
      }
    }

    stage('Build') {
      steps {
        sh 'pnpm build'
      }
    }

    stage('Testes unitários (vitest)') {
      steps {
        // Suíte unitária estrita: NÃO mascaramos falha pra ficar verde. Se
        // houver teste pré-existente vermelho na dev, o gate trava de
        // propósito até ser corrigido.
        sh 'pnpm test'
      }
    }

    stage('E2E (Playwright)') {
      steps {
        // Credenciais do cliente de teste só existem dentro deste bloco.
        withCredentials([usernamePassword(
          credentialsId: 'e2e-test-client',
          usernameVariable: 'E2E_CLIENT_EMAIL',
          passwordVariable: 'E2E_CLIENT_PASSWORD',
        )]) {
          sh '''
            pnpm exec playwright install --with-deps chromium
            pnpm test:e2e
          '''
        }
      }
      post {
        always {
          // Relatório HTML do Playwright pra inspeção quando algo falha.
          archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
        }
      }
    }

    stage('Gate manual') {
      when { branch 'dev' }
      steps {
        milestone ordinal: 1
        timeout(time: 60, unit: 'MINUTES') {
          input message: 'Promover a dev para a main?', ok: 'Promover'
        }
      }
    }

    stage('Promover para main') {
      when { branch 'dev' }
      steps {
        milestone ordinal: 2
        withCredentials([usernamePassword(
          credentialsId: 'git-push-main',
          usernameVariable: 'GIT_USER',
          passwordVariable: 'GIT_TOKEN',
        )]) {
          // Traz o estado remoto e faz o merge de dev -> main, mantendo o
          // histórico (merge commit). Sem reescrever histórico de branch
          // compartilhada.
          sh '''
            set -e
            REMOTE="https://${GIT_USER}:${GIT_TOKEN}@github.com/Bear-System-Brasil/bear-delivery-app-web.git"
            git config user.email "ci@bearsystem.com.br"
            git config user.name "Bear CI"
            git fetch "$REMOTE" dev main
            git checkout -B main origin/main
            git merge --no-ff origin/dev -m "chore(release): promove dev para main [ci]"
            git push "$REMOTE" HEAD:main
          '''
        }
      }
    }
  }

  post {
    always {
      // Não deixa credencial em arquivo de config do git no workspace.
      sh 'git config --unset-all http.extraheader || true'
    }
  }
}
