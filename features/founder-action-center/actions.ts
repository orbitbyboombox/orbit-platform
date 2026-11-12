"use server";
import { validateFounderActions } from "./diagnostic.actions";
// Retain the existing callable name, but never hide an unresolved source.
export async function dismissFounderActionsAction(actionKeys: string[]) {
  return validateFounderActions(actionKeys);
}
