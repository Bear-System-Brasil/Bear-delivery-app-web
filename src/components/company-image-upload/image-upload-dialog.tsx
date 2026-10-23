"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  message?: string;
}

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL já salva no backend (a foto atual). */
  currentUrl: string;
  title: string;
  description?: string;
  alt: string;
  /** "avatar" mostra a imagem num círculo; "cover" num retângulo largo. */
  shape: "avatar" | "cover";
  /** Texto do estado vazio (quando ainda não há imagem). */
  emptyHint: string;
  maxSizeMB?: number;
  successMessage: string;
  /** Faz o upload de fato. Só é chamado ao confirmar com "Salvar foto". */
  upload: (file: File) => Promise<ImageUploadResult>;
  onUploaded: (url: string) => void;
  /**
   * Opcional: quando passado e já existe foto, mostra "Remover foto" no
   * rodapé. Fica a cargo do pai limpar o valor (ex.: onChange("")). Logo e
   * capa não passam, então seguem sem opção de remover.
   */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Esperas entre as tentativas de ler o arquivo escolhido. No Chrome do Android
 * a leitura logo depois da escolha falha com frequência e passa alguns
 * instantes depois (medido no celular, LDMF-412), então tenta de novo antes de
 * desistir. Somando, ~2s de espera no pior caso.
 */
export const READ_RETRY_DELAYS_MS = [300, 700, 1200];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lê o arquivo inteiro, tentando de novo nas esperas acima. Para no meio se
 * `isCurrent` disser que a escolha já foi substituída (outra foto, cancelar,
 * fechar). Se todas falharem, rejeita com o último erro.
 */
async function readWithRetry(
  file: File,
  isCurrent: () => boolean,
  onFail?: (error: unknown) => void,
): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await wait(READ_RETRY_DELAYS_MS[attempt - 1]);
      if (!isCurrent()) throw new Error("escolha substituida");
    }
    try {
      return await file.arrayBuffer();
    } catch (error) {
      lastError = error;
      onFail?.(error);
    }
  }
  throw lastError;
}

/**
 * Abre a imagem em tamanho cheio (sem corte) e só grava no backend depois de
 * escolher "Trocar foto" e confirmar em "Salvar foto" - não salva ao escolher
 * o arquivo, diferente do comportamento antigo (LDMF-410).
 */
export function ImageUploadDialog({
  open,
  onOpenChange,
  currentUrl,
  title,
  description,
  alt,
  shape,
  emptyHint,
  maxSizeMB = 5,
  successMessage,
  upload,
  onUploaded,
  onRemove,
  removeLabel = "Remover foto",
}: ImageUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Lendo o arquivo escolhido antes de mostrar o preview.
  const [reading, setReading] = useState(false);
  // Conta as escolhas, pra descartar uma leitura que terminou depois de outra.
  const pickSeqRef = useRef(0);
  // O navegador não conseguiu desenhar o preview pendente (a <img> deu erro).
  const [previewFailed, setPreviewFailed] = useState(false);
  // DIAGNOSTICO TEMPORARIO (LDMF-412) - remover antes do PR. Mostra quantas
  // leituras falharam e o erro que o Chrome do Android devolveu, pra medir no
  // celular em vez de deduzir.
  const [readDiag, setReadDiag] = useState<string | null>(null);

  const shownUrl = pendingPreview ?? currentUrl;
  const hasImage = Boolean(shownUrl);

  // Object URL do preview pendente. Fica num ref atualizado na hora (não num
  // efeito) pra revogar fora do updater do setState: o React pode rodar o
  // updater mais de uma vez, e efeito colateral ali dentro é frágil.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      // Revoga o pendente se o componente sair sem limpar (evita vazar) e
      // descarta uma leitura que ainda esteja em andamento.
      pickSeqRef.current++;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const replacePreview = (next: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setPendingPreview(next);
    setPreviewFailed(false);
  };

  const clearPending = () => {
    // Invalida uma leitura em andamento pra ela não repor o preview depois.
    pickSeqRef.current++;
    setReading(false);
    setReadDiag(null);
    replacePreview(null);
    setPendingFile(null);
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    try {
      await pickFile(input.files?.[0]);
    } finally {
      // Libera reescolher o mesmo arquivo depois. Só limpa depois da leitura:
      // no Android, limpar o input logo na escolha pode soltar o acesso ao
      // arquivo antes de lê-lo (LDMF-412).
      input.value = "";
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      toast.error(`A imagem deve ter no máximo ${maxSizeMB}MB`);
      return;
    }

    // Lê o arquivo inteiro antes de montar o preview. No Chrome do Android o
    // File escolhido aponta pro seletor do sistema e é lido aos poucos; o
    // object URL criado direto dele às vezes falhava e a <img> mostrava o
    // ícone de imagem quebrada, embora o upload funcionasse (LDMF-412). Com
    // os bytes já em memória, o preview não depende mais dessa leitura.
    const seq = ++pickSeqRef.current;
    setReading(true);
    setReadDiag(null);
    const failures: string[] = [];
    const describe = (error: unknown) =>
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    let bytes: ArrayBuffer;
    try {
      bytes = await readWithRetry(
        file,
        () => seq === pickSeqRef.current,
        (error) => failures.push(describe(error)),
      );
    } catch {
      if (seq !== pickSeqRef.current) return;
      setReadDiag(
        `leitura falhou ${failures.length}x, sem preview lido (${failures[failures.length - 1]})`,
      );
      // Não bloqueia o Salvar: no celular o upload, que lê o arquivo depois,
      // quase sempre funciona mesmo quando esta leitura falha. O preview tenta
      // o arquivo original (como antes); se a <img> não desenhar, o onError
      // troca pelo aviso de prévia indisponível.
      replacePreview(URL.createObjectURL(file));
      setPendingFile(file);
      setReading(false);
      return;
    }
    // Outra escolha, cancelar ou fechar no meio da leitura: descarta esta.
    if (seq !== pickSeqRef.current) return;
    setReadDiag(
      failures.length
        ? `leitura falhou ${failures.length}x e passou na ${failures.length + 1}a (${failures[failures.length - 1]})`
        : "leitura ok na 1a",
    );

    // Preview e arquivo trocam juntos, sem janela em que o pendente já vale
    // mas o preview ainda mostra a foto antiga.
    replacePreview(URL.createObjectURL(new Blob([bytes], { type: file.type })));
    // O upload também usa a cópia em memória, pra não depender de o Android
    // entregar o arquivo de novo na hora do Salvar.
    setPendingFile(
      new File([bytes], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      }),
    );
    setReading(false);
  };

  const handleSave = async () => {
    if (!pendingFile) return;
    try {
      setUploading(true);
      const result = await upload(pendingFile);
      if (result.success && result.url) {
        onUploaded(result.url);
        toast.success(successMessage);
        clearPending();
        onOpenChange(false);
      } else {
        toast.error(result.message || "Erro ao fazer upload");
      }
    } catch {
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    if (uploading) return;
    onRemove?.();
    clearPending();
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    // Enquanto sobe, não deixa fechar por fora (ESC/overlay).
    if (uploading) return;
    if (!next) clearPending();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Moldura flexível que acompanha a imagem (altura só limitada por
            max-h), pra qualquer proporção aparecer inteira e sem tarja. Forçar
            círculo/quadrado deixava foto não-quadrada com faixa cinza dentro do
            círculo (LDMF-412); avatar só difere por uma largura máxima menor. */}
        <div
          className={
            shape === "avatar"
              ? "mx-auto flex min-h-[180px] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-3"
              : "flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-3"
          }
        >
          {reading ? (
            <span
              role="status"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando a imagem...
            </span>
          ) : pendingPreview && previewFailed ? (
            // Sem o ícone de imagem quebrada: o arquivo foi lido e pode ser
            // salvo, só o navegador não conseguiu mostrar a prévia.
            <span
              role="status"
              className="px-4 text-center text-xs text-muted-foreground"
            >
              Não deu pra mostrar a prévia, mas a foto pode ser salva.
            </span>
          ) : hasImage ? (
            // Logo/capa do restaurante seguem como <img> por decisão de projeto.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownUrl}
              alt={alt}
              onError={() => {
                if (pendingPreview) setPreviewFailed(true);
              }}
              className="max-h-[280px] w-auto max-w-full object-contain"
            />
          ) : (
            <span className="px-4 text-center text-xs text-muted-foreground">
              {emptyHint}
            </span>
          )}
        </div>

        {/* DIAGNOSTICO TEMPORARIO (LDMF-412) - remover antes do PR. */}
        {readDiag && (
          <p
            data-testid="read-diag"
            className="-mt-2 text-center text-[10px] text-muted-foreground"
          >
            diagnóstico: {readDiag}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePick}
          className="hidden"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          {pendingFile ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={clearPending}
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={uploading}
                className="gap-2"
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar foto
              </Button>
            </>
          ) : (
            <>
              {onRemove && currentUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={reading}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {removeLabel}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={reading}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {hasImage ? "Trocar foto" : "Escolher foto"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
