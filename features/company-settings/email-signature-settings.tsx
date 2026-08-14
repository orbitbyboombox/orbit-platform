"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { uploadEmailSignatureAction } from "./actions";

export function EmailSignatureSettings({ url }: { url: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <section className="mt-5 rounded-2xl border bg-card p-5" id="email-signature-settings">
    <h3 className="font-semibold">Identidad · Firma de correo</h3>
    <p className="mt-2 text-sm text-muted">{url ? "Firma GIF oficial configurada con URL pública no expirable." : "OFFICIAL EMAIL SIGNATURE GIF — PENDING FOUNDER UPLOAD. Los correos usan el fallback Equipo BOOMBOX."}</p>
    {url && <Image alt="Firma corporativa BOOMBOX" className="mt-4 h-auto max-h-40 w-auto max-w-full" height={160} src={url} unoptimized width={480} />}
    <input accept="image/gif" className="mt-4 block w-full text-sm text-muted" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
    <ActionButton className="mt-3" disabled={pending || !file} icon={Upload} label={pending ? "Cargando…" : "Cargar GIF oficial"} onClick={() => start(async () => { if (!file) return; const data = new FormData(); data.set("file", file); const result = await uploadEmailSignatureAction(data); setMessage(result.ok ? result.message : result.error); if (result.ok) router.refresh(); })} type="button" />
    {message && <p className="mt-2 text-sm" aria-live="polite">{message}</p>}
  </section>;
}
