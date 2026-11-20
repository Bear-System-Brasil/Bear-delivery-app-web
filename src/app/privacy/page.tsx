import type { Metadata } from "next";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_RESPONSIBLES,
  LegalList,
  LegalPage,
  LegalSection,
  PRIVACY_UPDATED_AT,
} from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Como o Beara Delivery coleta, usa, compartilha e protege os seus dados pessoais.",
};

// Conteúdo levantado do próprio app (LDMF-281): campos dos cadastros,
// serviços externos chamados e onde o backend roda. Mudou o que o app coleta
// ou com quem compartilha? Esta página precisa mudar junto.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updatedAt={PRIVACY_UPDATED_AT}>
      <p>
        Esta política explica quais dados pessoais o Beara Delivery coleta, para
        que usamos, com quem compartilhamos e quais são os seus direitos, de
        acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 -
        LGPD).
      </p>

      <LegalSection title="1. Quem é responsável pelos seus dados">
        <p>
          O Beara Delivery ainda não tem empresa constituída. Os responsáveis
          pelo tratamento dos seus dados (controladores) são{" "}
          <strong>{LEGAL_RESPONSIBLES}</strong>.
        </p>
        <p>
          Para qualquer assunto sobre os seus dados, fale com a gente pelo
          e-mail{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-semibold text-brand-600 underline dark:text-brand-400"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Quais dados coletamos">
        <p>
          <strong>Se você é cliente:</strong>
        </p>
        <LegalList>
          <li>nome, e-mail, CPF, telefone e data de nascimento;</li>
          <li>senha (guardada de forma protegida, nunca em texto aberto);</li>
          <li>foto de perfil, se você enviar uma;</li>
          <li>
            endereços de entrega, com a localização no mapa que você confirma;
          </li>
          <li>
            a localização do seu aparelho, só se você permitir, para mostrar
            os restaurantes que entregam perto de você;
          </li>
          <li>
            seus pedidos: itens, valores, forma de pagamento escolhida e troco.
          </li>
        </LegalList>
        <p>
          <strong>Se você é restaurante:</strong> razão social, nome fantasia,
          CNPJ, e-mail, telefone, endereço, logo e as informações do cardápio.
        </p>
        <p>
          <strong>Se você é entregador:</strong> seus dados de cadastro e a sua
          localização no momento em que aceita uma entrega e durante o trajeto
          até o cliente.
        </p>
        <p>
          <strong>Pagamentos:</strong> hoje o pagamento é feito na entrega
          (dinheiro, maquininha ou Pix). O Beara Delivery{" "}
          <strong>não recebe nem guarda dados de cartão</strong>.
        </p>
      </LegalSection>

      <LegalSection title="3. Para que usamos os seus dados">
        <LegalList>
          <li>criar e manter a sua conta e confirmar que é você quem acessa;</li>
          <li>
            fazer o pedido chegar: enviar o pedido ao restaurante e o endereço
            ao entregador;
          </li>
          <li>
            mostrar os restaurantes que atendem a sua região e calcular a
            entrega;
          </li>
          <li>
            permitir que o restaurante e o entregador falem com você sobre o
            pedido;
          </li>
          <li>identificar o titular da conta (CPF);</li>
          <li>atender pedidos de suporte e cumprir obrigações legais.</li>
        </LegalList>
        <p>
          A maior parte desse uso é necessária para cumprir o serviço que você
          contratou ao fazer um pedido (LGPD, art. 7º, V). A localização do
          aparelho só é usada com a sua permissão, que pode ser retirada nas
          configurações do navegador a qualquer momento.
        </p>
      </LegalSection>

      <LegalSection title="4. Com quem compartilhamos">
        <LegalList>
          <li>
            <strong>Restaurante do pedido:</strong> seu nome, telefone,
            endereço de entrega e os itens do pedido.
          </li>
          <li>
            <strong>Entregador:</strong> antes de aceitar a entrega, ele vê só
            o bairro e a cidade. Seu nome, telefone e endereço completo só
            aparecem para o entregador que aceitou o seu pedido.
          </li>
          <li>
            <strong>Serviços que fazem o app funcionar:</strong> hospedagem do
            site (Vercel), servidor e banco de dados (Hostinger), armazenamento
            de imagens (Cloudflare e Amazon Web Services), mapas e busca de
            endereço (OpenStreetMap e Nominatim), consulta de CEP (ViaCEP e
            BrasilAPI) e identificação da cidade pela localização
            (BigDataCloud). Eles recebem apenas o necessário para a sua função.
          </li>
        </LegalList>
        <p>
          Alguns desses serviços podem guardar dados em servidores fora do
          Brasil. Nesses casos, usamos fornecedores que adotam medidas de
          proteção compatíveis com a LGPD.
        </p>
        <p>
          <strong>Não vendemos os seus dados</strong> e não os usamos para
          publicidade de terceiros.
        </p>
      </LegalSection>

      <LegalSection title="5. Por quanto tempo guardamos">
        <p>
          Guardamos os seus dados enquanto a sua conta existir. Se você pedir a
          exclusão, apagamos os dados da conta em até 15 dias. O histórico de
          pedidos pode ser mantido pelo tempo exigido por lei, só para cumprir
          obrigações legais, e depois é apagado.
        </p>
      </LegalSection>

      <LegalSection title="6. Seus direitos">
        <p>Pela LGPD, você pode a qualquer momento pedir para:</p>
        <LegalList>
          <li>saber quais dados seus nós temos;</li>
          <li>corrigir dados errados ou desatualizados;</li>
          <li>apagar seus dados e a sua conta;</li>
          <li>receber uma cópia dos seus dados;</li>
          <li>saber com quem compartilhamos os seus dados;</li>
          <li>retirar uma permissão que você deu (como a de localização).</li>
        </LegalList>
        <p>
          Para isso, mande um e-mail para{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-semibold text-brand-600 underline dark:text-brand-400"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          a partir do e-mail cadastrado na sua conta. Respondemos em até 15
          dias. Se não ficar satisfeito, você também pode procurar a
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>
          Usamos conexão criptografada (HTTPS), senhas protegidas e acesso
          restrito aos dados. Nenhum sistema é totalmente imune a falhas; se
          acontecer um incidente que possa trazer risco a você, avisaremos e
          comunicaremos a ANPD, como manda a lei.
        </p>
      </LegalSection>

      <LegalSection title="8. Dados guardados no seu aparelho">
        <p>
          O app guarda no seu navegador o que é necessário para funcionar: a
          sessão de login, o carrinho, os favoritos e as suas preferências
          (como o tema claro ou escuro). Não usamos cookies de publicidade.
        </p>
      </LegalSection>

      <LegalSection title="9. Menores de idade">
        <p>
          O Beara Delivery é destinado a maiores de 18 anos. Não coletamos
          intencionalmente dados de menores. Se soubermos que uma conta é de
          menor de idade, ela será excluída.
        </p>
      </LegalSection>

      <LegalSection title="10. Mudanças nesta política">
        <p>
          Podemos atualizar esta política. Quando a mudança for importante,
          avisaremos no app. A data da última atualização fica sempre no topo
          desta página.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
