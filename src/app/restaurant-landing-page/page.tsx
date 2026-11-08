"use client";

import { MainHeader } from "@/components/main-header";
import { BearDeliveryLogo } from "@/components/ui/bear-delivery-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock,
  CreditCard,
  Shield,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATS = [
  { value: "500+", label: "Restaurantes" },
  { value: "50k+", label: "Pedidos/Mês" },
  { value: "4.8★", label: "Avaliação" },
];

const LIGHT_GRADIENT =
  "from-[var(--color-brand-400)] to-[var(--color-brand-500)]";

const BENEFITS = [
  {
    icon: Users,
    title: "Alcance Milhares de Clientes",
    description:
      "Conecte-se com uma base crescente de usuários famintos na sua região",
  },
  {
    icon: TrendingUp,
    title: "Aumente suas Vendas",
    description:
      "Sistema completo de gestão de pedidos para maximizar seu faturamento",
  },
  {
    icon: Clock,
    title: "Entrega Rápida",
    description: "Entregas em até 30 minutos com nossa rede de entregadores",
  },
  {
    icon: ShoppingBag,
    title: "Gestão Simplificada",
    description: "Painel completo para gerenciar pedidos, menu e relatórios",
  },
  {
    icon: Shield,
    title: "Pagamento Seguro",
    description: "Transações protegidas e repasse automático em 48h",
  },
  {
    icon: CreditCard,
    title: "Sem Taxa de Adesão",
    description: "Comece a vender sem custos iniciais. Pague apenas por venda",
  },
];

const STEPS = [
  {
    number: 1,
    title: "Cadastre seu Restaurante",
    description:
      "Preencha o formulário com as informações do seu estabelecimento",
  },
  {
    number: 2,
    title: "Configure seu Menu",
    description: "Adicione seus pratos, fotos e preços através do painel",
  },
  {
    number: 3,
    title: "Comece a Vender",
    description: "Receba pedidos e gerencie entregas em tempo real",
  },
];

export default function RestaurantLandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-muted relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-64 h-64 bg-gradient-to-r from-brand-400/20 to-brand-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-20 w-48 h-48 bg-gradient-to-r from-brand-400/15 to-brand-400/15 rounded-full blur-2xl animate-pulse delay-1000" />
        <div className="absolute bottom-40 left-1/4 w-80 h-80 bg-gradient-to-r from-yellow-400/10 to-brand-400/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <main className="relative">
        <div className="pt-6 px-4 md:px-8 relative z-10">
          <MainHeader
            showLogo
            showSearch={false}
            showLocation={false}
            showCart={false}
            showMenu
          />
        </div>

        <section className="pt-20 pb-16 px-4">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
              <span className="text-foreground">
                Leve seu Restaurante para o{" "}
              </span>
              <span
                className={`bg-gradient-to-r ${LIGHT_GRADIENT} bg-clip-text text-transparent`}
              >
                Próximo Nível
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-8">
              Alcance milhares de clientes e faça seu negócio crescer com a
              plataforma de delivery mais rápida e confiável.
            </p>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => router.push("/restaurant-register")}
              className="h-14 px-8 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl cursor-pointer"
            >
              Cadastrar Meu Restaurante Grátis
            </Button>
            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
              {STATS.map(({ value, label }) => (
                <div key={label}>
                  <div
                    className={`text-3xl md:text-4xl font-bold bg-gradient-to-r ${LIGHT_GRADIENT} bg-clip-text text-transparent`}
                  >
                    {value}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="py-20 px-4 relative">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Por que escolher o Bear Delivery?
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Tudo que você precisa para crescer seu negócio
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {BENEFITS.map(({ icon: Icon, title, description }) => (
                <Card
                  key={title}
                  className="border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 rounded-2xl"
                >
                  <CardContent className="p-6">
                    {/* QUADRADINHO AGORA CLARO */}
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${LIGHT_GRADIENT} flex items-center justify-center mb-4 shadow-[0_4px_12px_rgba(255,122,0,0.25)]`}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{title}</h3>
                    <p className="text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="py-20 px-4 bg-card/50 backdrop-blur-sm relative"
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Como Funciona
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Comece a vender em 3 passos simples
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {STEPS.map(({ number, title, description }) => (
                <div key={number} className="text-center">
                  <div
                    className={`w-16 h-16 rounded-full bg-gradient-to-br ${LIGHT_GRADIENT} flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl shadow-[0_6px_16px_rgba(255,122,0,0.3)]`}
                  >
                    {number}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{title}</h3>
                  <p className="text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-4 relative overflow-hidden">
          <div
            className={`absolute inset-0 bg-gradient-to-r ${LIGHT_GRADIENT}`}
          />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pronto para começar?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Cadastre seu restaurante agora e comece a receber pedidos hoje
              mesmo
            </p>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => router.push("/restaurant-register")}
              className="h-14 px-8 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl cursor-pointer"
            >
              Cadastrar Meu Restaurante Grátis
            </Button>
          </div>
        </section>

        <footer className="border-t bg-card/80 backdrop-blur-sm py-8 px-4 relative">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <Link href="/" className="shrink-0">
                <BearDeliveryLogo />
              </Link>
              <nav className="flex gap-6 text-sm text-muted-foreground">
                <Link
                  href="/"
                  className="hover:text-brand-500 transition-colors"
                >
                  Home
                </Link>
                <a
                  href="#beneficios"
                  className="hover:text-brand-500 transition-colors"
                >
                  Benefícios
                </a>
                <a
                  href="#como-funciona"
                  className="hover:text-brand-500 transition-colors"
                >
                  Como Funciona
                </a>
                <a href="#" className="hover:text-brand-500 transition-colors">
                  Contato
                </a>
              </nav>
              <p className="text-sm text-muted-foreground">
                © 2025 Bear Delivery. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
