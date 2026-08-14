"use client";

export function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`Storage rechazó la carga (HTTP ${request.status}).`));
    });
    request.addEventListener("error", () => reject(new Error("La conexión con Storage se interrumpió.")));
    request.addEventListener("abort", () => reject(new Error("La carga fue cancelada.")));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.send(body);
  });
}
