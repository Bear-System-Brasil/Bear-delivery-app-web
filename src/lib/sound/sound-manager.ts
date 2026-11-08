import { useAuthStore } from "@/stores/auth-store";
import {
  ALERT_LOOP_MS,
  SOUND_BUNDLES,
  SOUND_FILES,
  type SoundBundle,
  type SoundName,
} from "./manifest";

const MUTED_KEY = "like:sound-muted";
const VOLUME_KEY = "like:sound-volume";

/**
 * Toca a identidade sonora da marca.
 *
 * Usa Web Audio (e não `new Audio()`) por três motivos que importam aqui:
 * sons podem se sobrepor sem clonar elemento, o volume é controlável em tempo
 * real, e o mesmo AudioContext destravado serve para todos os sons — com
 * `<audio>` cada elemento precisa do seu próprio gesto do usuário no iOS.
 *
 * Regra da casa: som nunca quebra o app. Todo caminho de falha (arquivo
 * ausente, codec recusado, autoplay bloqueado, aba sem áudio) degrada para
 * silêncio, nunca para exceção.
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading = new Map<SoundName, Promise<AudioBuffer | null>>();
  private loops = new Map<SoundName, ReturnType<typeof setInterval>>();
  private listeners = new Set<() => void>();
  private lastPlayed = new Map<SoundName, number>();
  private unlockInstalled = false;
  private failed = new Set<SoundName>();

  private muted = false;
  private volume = 1;
  private hydrated = false;

  // ─── Preferências ────────────────────────────────────────────────────────

  /**
   * Lê as preferências do localStorage na primeira vez que alguém pergunta.
   * Não pode acontecer no construtor: o módulo é avaliado no servidor durante
   * o SSR, onde `window` não existe.
   */
  private hydrate() {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    try {
      const storedMuted = window.localStorage.getItem(MUTED_KEY);
      if (storedMuted !== null) {
        this.muted = storedMuted === "1";
      } else {
        // Sem preferência gravada: financeiro começa sem som por padrão;
        // outros papéis começam com o alerta ativo por padrão (LDMF-329).
        const user = useAuthStore.getState().user;
        this.muted = user?.role === "financial";
      }

      // Sem `raw` o app abre mudo na primeira visita: `Number(null)` é 0, que
      // passa em todas as validações abaixo e zera o volume de quem nunca
      // mexeu na preferência. `"0"` é string truthy, então o volume zero
      // gravado de propósito continua sendo respeitado.
      const raw = window.localStorage.getItem(VOLUME_KEY);
      if (raw) {
        const vol = Number(raw);
        if (Number.isFinite(vol) && vol >= 0 && vol <= 1) this.volume = vol;
      }
    } catch {
      // Modo privativo / storage bloqueado: segue com os padrões.
    }
  }

  isMuted() {
    this.hydrate();
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.hydrate();
    if (this.muted === muted) return;
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {
      // Preferência não persiste, mas vale para esta sessão.
    }
    if (muted) this.stopAll();
    this.emit();
  }

  toggleMuted() {
    this.setMuted(!this.isMuted());
  }

  getVolume() {
    this.hydrate();
    return this.volume;
  }

  setVolume(volume: number) {
    this.hydrate();
    const next = Math.min(1, Math.max(0, volume));
    this.volume = next;
    try {
      window.localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // idem
    }
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  // ─── Contexto de áudio ───────────────────────────────────────────────────

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx) return this.ctx;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;

      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    } catch {
      return null;
    }

    return this.ctx;
  }

  /**
   * O navegador cria o AudioContext suspenso e só libera depois de um gesto
   * do usuário. Sem isto, todo som disparado por polling (pedido pronto,
   * pedido novo) some silenciosamente — o caso mais comum de "o som não
   * funciona" em app de delivery, porque quem está esperando não está tocando
   * na tela.
   */
  unlock() {
    const ctx = this.getContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  }

  /**
   * Destrava no primeiro toque em qualquer lugar do app. Chamado sozinho na
   * primeira interação com o manager, então nenhuma tela precisa lembrar.
   */
  installUnlockHandlers() {
    if (this.unlockInstalled || typeof document === "undefined") return;
    this.unlockInstalled = true;

    const handler = () => this.unlock();
    for (const evt of ["pointerdown", "keydown", "touchstart"] as const) {
      document.addEventListener(evt, handler, { once: true, passive: true });
    }
  }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private async load(name: SoundName): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    if (this.failed.has(name)) return null;

    const inFlight = this.loading.get(name);
    if (inFlight) return inFlight;

    const ctx = this.getContext();
    if (!ctx) return null;

    const promise = (async () => {
      try {
        const res = await fetch(SOUND_FILES[name]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        this.buffers.set(name, buffer);
        return buffer;
      } catch {
        // Marca como falho para não tentar de novo a cada disparo.
        this.failed.add(name);
        return null;
      } finally {
        this.loading.delete(name);
      }
    })();

    this.loading.set(name, promise);
    return promise;
  }

  /** Deixa os sons de um papel prontos antes do primeiro disparo. */
  preload(bundle: SoundBundle | SoundName[]) {
    this.installUnlockHandlers();
    const names = Array.isArray(bundle) ? bundle : SOUND_BUNDLES[bundle];
    for (const name of names) void this.load(name);
  }

  // ─── Reprodução ──────────────────────────────────────────────────────────

  /**
   * Toca um som. Assíncrono por dentro, mas quem chama nunca precisa esperar
   * nem tratar erro — no pior caso não sai som.
   */
  play(name: SoundName, { gain = 1 }: { gain?: number } = {}) {
    this.hydrate();
    this.installUnlockHandlers();
    if (this.muted || this.volume === 0) return;

    // Evita disparos duplicados idênticos em menos de 500ms (ex: socket + polling concorrentes)
    const now = Date.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < 500) return;
    this.lastPlayed.set(name, now);

    void (async () => {
      const ctx = this.getContext();
      if (!ctx) return;

      const buffer = await this.load(name);
      if (!buffer || !this.masterGain) return;

      // Recheca depois do await: o usuário pode ter silenciado no meio do
      // carregamento, e um alerta em loop pode ter sido parado.
      if (this.muted) return;

      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          return;
        }
        if (ctx.state === "suspended") return;
      }

      try {
        const source = ctx.createBufferSource();
        const nodeGain = ctx.createGain();
        nodeGain.gain.value = Math.min(1, Math.max(0, gain)) * this.volume;
        source.buffer = buffer;
        source.connect(nodeGain);
        nodeGain.connect(this.masterGain);
        source.start();
        source.onended = () => {
          source.disconnect();
          nodeGain.disconnect();
        };
      } catch {
        // Contexto morreu no meio do caminho; ignora.
      }
    })();
  }

  /**
   * Alerta que insiste até alguém resolver: toca na hora e repete no intervalo
   * definido em ALERT_LOOP_MS. Chamar de novo com o alerta já ativo não
   * reinicia nada — evita empilhar timers quando o polling reentrega o mesmo
   * pedido novo.
   */
  loop(name: SoundName, intervalMs = ALERT_LOOP_MS[name] ?? 3000) {
    if (this.loops.has(name)) return;
    this.play(name);
    this.loops.set(
      name,
      setInterval(() => this.play(name), intervalMs),
    );
  }

  isLooping(name: SoundName) {
    return this.loops.has(name);
  }

  stopLoop(name: SoundName) {
    const timer = this.loops.get(name);
    if (!timer) return;
    clearInterval(timer);
    this.loops.delete(name);
  }

  stopAll() {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
  }
}

export const soundManager = new SoundManager();

if (typeof window !== "undefined") {
  useAuthStore.subscribe((state, prevState) => {
    if (state.user?.role !== prevState?.user?.role) {
      try {
        if (window.localStorage.getItem(MUTED_KEY) === null) {
          soundManager.setMuted(state.user?.role === "financial");
        }
      } catch {
        // Storage inacessível
      }
    }
  });
}
