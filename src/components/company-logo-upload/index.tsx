"use client";

import {
  ImageUploadDialog,
  type ImageUploadResult,
} from "@/components/company-image-upload/image-upload-dialog";
import { apiService } from "@/services/api";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";

interface CompanyLogoUploadProps {
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

export function CompanyLogoUpload({
  value,
  onChange,
  companyId,
  companyData,
  maxSizeMB = 5,
}: CompanyLogoUploadProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const upload = async (file: File): Promise<ImageUploadResult> => {
    const response = await apiService.uploadCompanyLogo(
      file,
      companyId,
      companyData,
    );
    return {
      success: response.success,
      url: response.data?.logo_url,
      message: response.message,
    };
  };

  if (!isMounted) {
    return (
      <div className="h-[76px] w-[76px] shrink-0 -mt-[30px] rounded-full border-[3px] border-background bg-muted" />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Logo da empresa"
        className="group relative h-[76px] w-[76px] shrink-0 -mt-[30px] cursor-pointer overflow-hidden rounded-full border-[3px] border-background bg-card shadow-sm"
      >
        {value ? (
          // Logo do restaurante segue como <img> por decisão de projeto.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Logo da empresa"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] font-semibold text-muted-foreground">
            Logo
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/35">
          <Camera className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </button>

      <ImageUploadDialog
        open={open}
        onOpenChange={setOpen}
        currentUrl={value}
        title="Logo da empresa"
        description="Veja a imagem atual e use “Trocar foto” para enviar outra."
        alt="Logo da empresa"
        shape="avatar"
        emptyHint="Nenhum logo enviado ainda"
        maxSizeMB={maxSizeMB}
        successMessage="Logo atualizado com sucesso!"
        upload={upload}
        onUploaded={onChange}
      />
    </>
  );
}
