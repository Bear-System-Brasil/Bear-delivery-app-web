#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Back de teste das notificações de pedido novo (LDMF-457)
//
// Fica no lugar do back durante o teste:
//
// - HTTP: repassa tudo pro back de TESTE. Login, telas e listas usam o
//   contrato real; nada aqui inventa rota ou campo.
// - Socket `/orders`: servido aqui. O front conecta neste socket e só recebe
//   o que o controle mandar, na hora exata (vários pedidos no mesmo
//   milissegundo, queda de rede).
// - O `orderCreated` sai do molde.json: um evento real do back de teste, com
//   os dados pessoais trocados. Cada disparo troca id, número e datas.
//
//   pnpm mock:notificacoes        (sobe em http://localhost:4100)
//
// Controle (GET):
//   /__mock/novo?qtd=3&gap=0   dispara qtd orderCreated, com gap ms entre eles
//   /__mock/queda              fecha a conexão dos sockets (o front reconecta)
//   /__mock/estado             sockets conectados e pedidos disparados
//
// Ver README.md desta pasta.
// ─────────────────────────────────────────────────────────────────────────────
import http from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";

const PORT = Number(process.env.MOCK_PORT ?? 4100);
const UPSTREAM = "https://like-delivery-backend.onrender.com";

const molde = JSON.parse(readFileSync(new URL("./molde.json", import.meta.url), "utf8"));

// Os números começam altos pra não se confundir com pedido real do dia.
let proximoNumero = 900;
let disparados = 0;

function novoPedido() {
  const agora = new Date().toISOString();
  const id = randomUUID();
  const pedido = structuredClone(molde.orderCreated);
  Object.assign(pedido, { id, orderNumber: proximoNumero++, created_at: agora, updated_at: agora, statusChangedAt: agora });
  for (const item of pedido.orderedItems ?? []) item.orderId = id;
  if (pedido.pickup) pedido.pickup.orderId = id;
  return pedido;
}

async function repassar(req, res) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
  const headers = { ...req.headers };
  for (const h of ["host", "connection", "content-length", "accept-encoding"]) delete headers[h];

  try {
    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(partes),
    });
    const saida = {};
    upstream.headers.forEach((valor, nome) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(nome)) saida[nome] = valor;
    });
    res.writeHead(upstream.status, saida);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (erro) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "mock: o back de teste não respondeu", erro: String(erro) }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/socket.io")) return; // o socket.io responde

  if (url.pathname.startsWith("/__mock/")) {
    const json = (corpo) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo));
    };

    if (url.pathname === "/__mock/novo") {
      const qtd = Number(url.searchParams.get("qtd") ?? 1);
      const gap = Number(url.searchParams.get("gap") ?? 0);
      const lista = [];
      for (let i = 0; i < qtd; i++) {
        if (i > 0 && gap > 0) await new Promise((ok) => setTimeout(ok, gap));
        const pedido = novoPedido();
        lista.push({ id: pedido.id, orderNumber: pedido.orderNumber });
        disparados++;
        pedidos.to("empresa").emit("orderCreated", pedido);
      }
      return json({ disparados: lista, naSala: pedidos.adapter.rooms.get("empresa")?.size ?? 0 });
    }

    // Queda de rede: fecha o transporte, e o cliente reconecta sozinho como
    // numa queda real (o servidor expulsar o socket não reconectaria).
    if (url.pathname === "/__mock/queda") {
      const sockets = [...pedidos.sockets.values()];
      for (const socket of sockets) socket.conn.close();
      return json({ caidos: sockets.length });
    }

    if (url.pathname === "/__mock/estado") {
      return json({ conectados: pedidos.sockets.size, naSala: pedidos.adapter.rooms.get("empresa")?.size ?? 0, disparados });
    }

    res.writeHead(404);
    return res.end();
  }

  return repassar(req, res);
});

const io = new Server(server, { cors: { origin: true, credentials: true } });
const pedidos = io.of("/orders");
pedidos.on("connection", (socket) => {
  socket.on("joinCompanyOrders", (_payload, ack) => {
    socket.join("empresa");
    if (typeof ack === "function") ack(molde.ackJoinCompanyOrders);
  });
});

server.listen(PORT, () => {
  console.log(`Back de teste das notificações em http://localhost:${PORT}`);
  console.log(`HTTP repassado pra ${UPSTREAM}; socket /orders servido aqui.`);
  console.log(`Disparar: curl "http://localhost:${PORT}/__mock/novo?qtd=3"`);
});
