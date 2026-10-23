"use client";

import {
  ImageUploadDialog,
  type ImageUploadResult,
} from "@/components/company-image-upload/image-upload-dialog";
import { apiService } from "@/services/api";
import { Upload } from "lucide-react";
import { useEffect, useState } from "react";

interface UserPhotoUploadProps {
  value: string;
  onChange: (url: string) => void;
  userId: string;
  userData?: {
    name?: string;
    email?: string;
    cpf?: string;
    phone?: string;
  };
  label?: string;
  maxSizeMB?: number;
}

/**
 * Foto de perfil do usuário. Clica no avatar -> abre o modal compartilhado
 * (ver a imagem cheia, "Trocar foto" -> "Salvar foto", "Remover foto"). Não
 * salva ao escolher o arquivo, só ao confirmar - mesmo padrão do logo/capa
 * da empresa (LDMF-410), aplicado aqui pelo LDMF-412.
 */
export function UserPhotoUpload({
  value,
  onChange,
  userData,
  maxSizeMB = 5,
}: UserPhotoUploadProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const upload = async (file: File): Promise<ImageUploadResult> => {
    const response = await apiService.uploadUserPhoto(file, userData);
    return {
      success: response.success,
      url: response.data?.photoUrl,
      message: response.message,
    };
  };

  if (!isMounted) {
    return <div className="mx-auto h-40 w-40 rounded-full bg-muted" />;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Foto de perfil"
        className="group relative mx-auto flex h-40 w-40 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-brand-200 bg-card transition-all hover:border-brand-400 dark:border-brand-800"
      >
        {value ? (
          // Foto do usuário segue como <img> por decisão de projeto.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Foto de perfil"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 text-brand-400">
            <Upload className="h-9 w-9" />
            <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
              Adicionar Foto
            </span>
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
          <Upload className="h-6 w-6" />
          <span className="text-xs font-medium">Alterar</span>
        </div>
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Clique na foto para ver, trocar ou remover
      </p>

      <ImageUploadDialog
        open={open}
        onOpenChange={setOpen}
        currentUrl={value}
        title="Foto de perfil"
        description="Veja a imagem atual e use “Trocar foto” para enviar outra."
        alt="Foto de perfil"
        shape="avatar"
        emptyHint="Nenhuma foto enviada ainda"
        maxSizeMB={maxSizeMB}
        successMessage="Foto atualizada com sucesso!"
        upload={upload}
        onUploaded={onChange}
        onRemove={() => onChange("")}
      />
    </div>
  );
}
