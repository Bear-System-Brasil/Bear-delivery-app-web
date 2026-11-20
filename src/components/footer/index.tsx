import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";
import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 dark:bg-none dark:bg-background text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 border-b border-zinc-700 dark:border-border py-5 md:grid-cols-[1.5fr_1fr_1fr] md:gap-10">
          <div className="space-y-3">
            <h3 className="bg-gradient-to-r from-brand-400 to-amber-500 bg-clip-text text-xl font-bold text-transparent">
              Beara Delivery
            </h3>
            <p className="max-w-sm text-sm leading-normal text-muted-foreground">
              Encontre os melhores restaurantes e receba seu pedido com rapidez
              e praticidade.
            </p>
            <div className="flex gap-2.5">
              <Link
                href="https://facebook.com"
                target="_blank"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 dark:bg-muted transition-colors hover:bg-brand-500 hover:text-white"
                aria-label="Facebook"
              >
                <Facebook className="h-4 w-4" />
              </Link>
              <Link
                href="https://instagram.com"
                target="_blank"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 dark:bg-muted transition-colors hover:bg-brand-500 hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </Link>
              <Link
                href="https://twitter.com"
                target="_blank"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 dark:bg-muted transition-colors hover:bg-brand-500 hover:text-white"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </Link>
              <Link
                href="https://linkedin.com"
                target="_blank"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 dark:bg-muted transition-colors hover:bg-brand-500 hover:text-white"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-base font-semibold text-white">Navegue</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Início
                </Link>
              </li>
              <li>
                <Link
                  href="/#lojas"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Lojas
                </Link>
              </li>
              <li>
                <Link
                  href="/orders"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Meus pedidos
                </Link>
              </li>
              <li>
                <Link
                  href="/profile"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Minha conta
                </Link>
              </li>
              <li>
                <Link
                  href="/restaurant-landing-page"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Registar meu restaurante
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-base font-semibold text-white">Ajuda</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/help"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Central de ajuda
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Termos de uso
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground transition-colors hover:text-brand-400"
                >
                  Privacidade
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="py-3">
          <p className="text-center text-sm text-muted-foreground">
            © {currentYear} Beara Delivery. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
