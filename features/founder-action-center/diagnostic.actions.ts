'use server';
import { revalidatePath } from 'next/cache';
import { loadActionDiagnostic } from './diagnostics.service';
import { canCompleteDiagnostics } from './diagnostic-model';
export async function inspectFounderAction(id: string) {
  try { return { ok: true as const, diagnostic: await loadActionDiagnostic(id) }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No fue posible cargar el diagnóstico.' }; }
}
export async function validateFounderActions(ids: string[]) {
  try {
    const keys = [...new Set(ids)];
    if (!keys.length || keys.length > 20) throw new Error('Selecciona un pendiente válido.');
    const diagnostics = await Promise.all(keys.map(loadActionDiagnostic));
    revalidatePath('/operations'); revalidatePath('/', 'layout');
    if (!canCompleteDiagnostics(diagnostics)) return { ok: false as const, error: 'El problema sigue activo. Revisa el diagnóstico y corrige el origen antes de marcar LISTO.', diagnostics };
    return { ok: true as const, diagnostics };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No fue posible verificar el estado.' }; }
}
