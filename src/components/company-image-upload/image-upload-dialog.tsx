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
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
}: ImageUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const shownUrl = pendingPreview ?? currentUrl;
  const hasImage = Boolean(shownUrl);

  const clearPending = () => {
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Libera reescolher o mesmo arquivo depois.
    input.value = "";

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

    const reader = new FileReader();
    reader.onloadend = () => setPendingPreview(reader.result as string);
    reader.readAsDataURL(file);
    setPendingFile(file);
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

        {/* Avatar: círculo fixo. Capa: moldura flexível que acompanha a imagem
            (altura só limitada por max-h) - num box 3:1 travado, uma capa
            quase-quadrada ficava minúscula entre duas tarjas (LDMF-410). */}
        <div
          className={
            shape === "avatar"
              ? "mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted"
              : "flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-3"
          }
        >
          {hasImage ? (
            // Logo/capa do restaurante seguem como <img> por decisão de projeto.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownUrl}
              alt={alt}
              className={
                shape === "avatar"
                  ? "h-full w-full object-contain"
                  : "max-h-[280px] w-auto max-w-full object-contain"
              }
            />
          ) : (
            <span className="px-4 text-center text-xs text-muted-foreground">
              {emptyHint}
            </span>
          )}
        </div>

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
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {hasImage ? "Trocar foto" : "Escolher foto"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
