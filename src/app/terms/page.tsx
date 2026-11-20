import type { Metadata } from "next";
import Link from "next/link";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_RESPONSIBLES,
  LegalList,
  LegalPage,
  LegalSection,
  TERMS_UPDATED_AT,
} from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Regras de uso do Beara Delivery para clientes, restaurantes e entregadores.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updatedAt={TERMS_UPDATED_AT}>
      <p>
        Estes termos são as regras para usar o Beara Delivery. Ao criar uma
        conta, você declara que leu e concorda com eles e com a nossa{" "}
        <Link
          href="/privacy"
          className="font-semibold text-brand-600 underline dark:text-brand-400"
        >
          Política de privacidade
        </Link>
        .
      </p>

      <LegalSection title="1. Quem somos">
        <p>
          O Beara Delivery é uma plataforma que conecta clientes, restaurantes e
          entregadores. Ainda não temos empresa constituída: a plataforma é
          mantida por <strong>{LEGAL_RESPONSIBLES}</strong>. Contato:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-semibold text-brand-600 underline dark:text-brand-400"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          O Beara Delivery não prepara os pedidos. Cada restaurante é
          responsável pelos produtos que vende, pelos preços, pela qualidade e
          pelas informações do seu cardápio.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta">
        <LegalList>
          <li>Para criar uma conta, você precisa ter 18 anos ou mais.</li>
          <li>
            Os dados do cadastro precisam ser verdadeiros e estar atualizados.
          </li>
          <li>
            Sua senha é pessoal. Você é responsável pelo que for feito na sua
            conta.
          </li>
          <li>
            Podemos suspender ou excluir contas com dados falsos, uso indevido
            ou que descumpram estes termos.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Pedidos e pagamento (cliente)">
        <LegalList>
          <li>
            Antes de confirmar, confira os itens, o endereço e o valor total.
          </li>
          <li>
            Hoje o pagamento é feito na entrega: dinheiro, maquininha ou Pix.
            Se precisar de troco, informe o valor ao fazer o pedido.
          </li>
          <li>
            O tempo de entrega é uma estimativa e pode variar com o movimento
            do restaurante, o trânsito e o clima.
          </li>
          <li>
            Problemas com o pedido (item faltando, errado ou com defeito) devem
            ser tratados com o restaurante. Se não resolver, fale com a gente
            pelo e-mail acima.
          </li>
          <li>
            Seus direitos como consumidor, previstos no Código de Defesa do
            Consumidor, continuam valendo.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Restaurantes">
        <LegalList>
          <li>
            O restaurante é responsável pelo cardápio, preços, disponibilidade,
            preparo, embalagem e por cumprir as normas sanitárias e fiscais.
          </li>
          <li>
            Os dados de clientes recebidos pelo app só podem ser usados para
            preparar e entregar o pedido.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="5. Entregadores">
        <LegalList>
          <li>
            O entregador só vê o nome, o telefone e o endereço completo do
            cliente depois de aceitar a entrega.
          </li>
          <li>
            Esses dados só podem ser usados para fazer aquela entrega. É
            proibido guardar, repassar ou usar os dados do cliente para
            qualquer outra finalidade, ou entrar em contato com ele fora do
            pedido.
          </li>
          <li>
            Se não puder fazer uma entrega que aceitou, o entregador deve
            devolvê-la pelo app antes de coletar o pedido, para que outro
            entregador possa assumir.
          </li>
          <li>
            Durante a entrega, a localização do entregador é compartilhada com
            o cliente para acompanhamento.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="6. O que não é permitido">
        <LegalList>
          <li>usar o app para fraude ou qualquer atividade ilegal;</li>
          <li>criar contas falsas ou se passar por outra pessoa;</li>
          <li>tentar acessar dados ou contas de outras pessoas;</li>
          <li>prejudicar o funcionamento da plataforma.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="7. Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para manter o app funcionando, mas ele pode ficar fora
          do ar por manutenção ou falhas técnicas. O Beara Delivery não se
          responsabiliza por produtos vendidos pelos restaurantes nem por
          problemas causados por informações erradas no cadastro.
        </p>
      </LegalSection>

      <LegalSection title="8. Mudanças nestes termos">
        <p>
          Podemos atualizar estes termos. Quando a mudança for importante,
          avisaremos no app. A data da última atualização fica sempre no topo
          desta página.
        </p>
      </LegalSection>

      <LegalSection title="9. Lei e foro">
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca
          de Castelo/ES, sem prejuízo do direito do consumidor de entrar com
          ação no foro do seu domicílio.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
