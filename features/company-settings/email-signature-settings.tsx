"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { finalizeEmailSignatureUploadAction, prepareEmailSignatureUploadAction } from "./actions";
import { uploadFileToSignedUrl } from "@/features/commercial-hub/direct-upload";

export function EmailSignatureSettings({ url }: { url: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [pending, start] = useTransition();
  return <section className="mt-5 rounded-2xl border bg-card p-5" id="email-signature-settings">
    <h3 className="font-semibold">Firma de correo</h3>
    <p className="mt-2 text-sm text-muted">{url ? "Firma gráfica oficial configurada." : "Carga la firma gráfica oficial. Mientras no exista, los correos muestran únicamente Equipo BOOMBOX."}</p>
    {url && <Image alt="Firma corporativa BOOMBOX" className="mt-4 h-auto max-h-40 w-auto max-w-full" height={160} src={url} unoptimized width={480} />}
    <input accept="image/gif,image/png,image/jpeg,image/webp" className="mt-4 block min-h-11 w-full text-base text-muted" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
    {pending && <div aria-label="Progreso de carga" className="mt-3 h-2 overflow-hidden rounded-full bg-muted/20"><div className="h-full bg-brand transition-[width]" style={{width:`${progress}%`}} /></div>}
    <ActionButton className="mt-3" disabled={pending || !file} icon={Upload} label={pending ? `Subiendo firma… ${progress}%` : "Cargar firma gráfica"} onClick={() => start(async () => { if (!file) return; setProgress(0); setMessage("Subiendo firma…"); try{const details={filename:file.name,mimeType:file.type,size:file.size};const prepared=await prepareEmailSignatureUploadAction(details);if(!prepared.ok)throw new Error(prepared.error);await uploadFileToSignedUrl(prepared.signedUrl,file,setProgress);const result=await finalizeEmailSignatureUploadAction({...details,path:prepared.path});setMessage(result.ok?result.message:result.error);if(result.ok)router.refresh()}catch(error){console.error("Email signature direct upload failed",error);setMessage(error instanceof Error?error.message:"No pudimos cargar la firma. Intenta nuevamente.")}})} type="button" />
    {message && <p className="mt-2 text-sm" aria-live="polite">{message}</p>}
  </section>;
}
