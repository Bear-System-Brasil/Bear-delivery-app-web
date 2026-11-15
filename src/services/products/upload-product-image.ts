/**
 * Envio de foto do prato. Fica fora do hook do cardápio para a criação e a
 * duplicação de prato (LDMF-489) usarem o mesmo caminho.
 */

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as Record<string, unknown>;
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if (Array.isArray(body.message) && body.message.length) {
    return String(body.message[0]);
  }
  if (typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return fallback;
}

export async function uploadProductImageSafe(productId: string, file: File) {
  const fieldNames = ["image", "file", "photo"];
  let lastMessage = "Erro ao fazer upload da imagem";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const field of fieldNames) {
      const formData = new FormData();
      formData.append(field, file, file.name);

      const response = await fetch(`/api/proxy/product/image/${productId}`, {
        method: "POST",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      const raw = await response.text();
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      if (response.ok) {
        return { success: true as const, data: payload };
      }

      lastMessage = readErrorMessage(
        payload,
        `Erro ${response.status} ao enviar a imagem`,
      );

      if (response.status === 404 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        break;
      }
    }
  }

  return { success: false as const, message: lastMessage };
}
