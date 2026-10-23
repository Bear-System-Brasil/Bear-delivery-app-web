"use client";

import {
  ImageUploadDialog,
  type ImageUploadResult,
} from "@/components/company-image-upload/image-upload-dialog";
import { apiService } from "@/services/api";
import { Camera, ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";

interface CompanyCoverUploadProps {
  value: string;
  onChange: (url: string) => void;
  companyId: string;
  companyData?: {
    tradeName?: string;
    legalName?: string;
    cnpj?: string;
    email?: string;
    phone?: string;
  };
  maxSizeMB?: number;
}

export function CompanyCoverUpload({
  value,
  onChange,
  companyId,
  companyData,
  maxSizeMB = 5,
}: CompanyCoverUploadProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const upload = async (file: File): Promise<ImageUploadResult> => {
    const response = await apiService.uploadCompanyCover(
      file,
      companyId,
      companyData,
    );
    return {
      success: response.success,
      url: response.data?.cover_url,
      message: response.message,
    };
  };

  if (!isMounted) {
    return <div className="aspect-[3/1] max-h-[210px] min-h-[150px] w-full bg-muted" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Imagem de capa"
        // Proporção 3:1 (spec 1200x400) com trava: cresce do mobile (~150px)
        // ate um teto no desktop em vez de virar uma faixa fina de 150px.
        className="group relative aspect-[3/1] max-h-[210px] min-h-[150px] w-full cursor-pointer overflow-hidden bg-muted"
      >
        {value ? (
          // Capa do restaurante segue como <img> por decisão de projeto.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Capa da empresa"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11.5px] font-semibold">
              Adicionar imagem de capa · 1200×400
            </span>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35">
          <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </button>

      <ImageUploadDialog
        open={open}
        onOpenChange={setOpen}
        currentUrl={value}
        title="Imagem de capa"
        description="Veja a imagem atual e use “Trocar foto” para enviar outra."
        alt="Capa da empresa"
        shape="cover"
        emptyHint="Nenhuma capa enviada ainda · 1200×400"
        maxSizeMB={maxSizeMB}
        successMessage="Imagem de capa atualizada com sucesso!"
        upload={upload}
        onUploaded={onChange}
      />
    </>
  );
}
