# Back de teste das notificações

Serve pra testar o alerta de pedido novo (som, toast, sino, lembrete e
notificação do sistema) sem fazer pedido real. Criado no LDMF-457.

## Como funciona

- **HTTP:** repassa tudo pro back de teste (`like-delivery-backend.onrender.com`).
  Login, telas e listas usam o contrato real.
- **Socket `/orders`:** é servido aqui. O front só recebe pedido novo quando
  você manda, e pode receber vários no mesmo instante.
- **O evento `orderCreated`** sai de `molde.json`: um evento real do back de
  teste, com os dados pessoais trocados. A cada disparo mudam o id, o número
  (a partir de 900) e as datas.

O teste fala só do front. Pedido disparado aqui não existe no back: abrir o
detalhe ou avançar o pedido não funciona. O teste final continua sendo com o
back real.

## Passo a passo

```bash
# 1. em um terminal: o mock (porta 4100)
pnpm mock:notificacoes

# 2. em outro: build e start do front apontado pro mock (porta 3200)
pnpm mock:front
```

Entre em http://localhost:3200 com uma conta de restaurante do back de teste
e abra qualquer tela da gestão. **Clique uma vez na página**: o navegador só
libera som depois de um gesto.

```bash
curl "http://localhost:4100/__mock/novo"             # 1 pedido
curl "http://localhost:4100/__mock/novo?qtd=5"       # 5 no mesmo instante
curl "http://localhost:4100/__mock/novo?qtd=3&gap=10000"  # 3, com 10s entre eles
curl "http://localhost:4100/__mock/queda"            # queda de rede (o front reconecta)
curl "http://localhost:4100/__mock/estado"           # sockets na sala e pedidos disparados
```

`naSala` no `/__mock/estado` diz quantas conexões do front estão ouvindo.
Uma tela da gestão abre 1. A Cozinha abre 2 (o sino e o quadro).

## Cuidado

- **O `.env` do projeto aponta pra produção.** Use sempre `pnpm mock:front`:
  ele fixa as URLs e aborta se o bundle não apontar pro mock. Um `next build`
  comum, rodado depois, desfaz isso.
- Senha de conta de teste só em variável de ambiente, nunca em arquivo.
