import { atom } from "jotai";
import { Editor } from "@tiptap/core";
import { PageEditMode } from "@/features/user/types/user.types.ts";

export const pageEditorAtom = atom<Editor | null>(null);

export const titleEditorAtom = atom<Editor | null>(null);

export const readOnlyEditorAtom = atom<Editor | null>(null);

export const yjsConnectionStatusAtom = atom<string>("");

export const yjsSyncedAtom = atom<boolean>(false);

export const showAiMenuAtom = atom(false);

// screen rectangle of the "Ask AI" button that opened the AI menu
export type AiMenuAnchor = { top: number; bottom: number; left: number };
export const aiMenuAnchorAtom = atom(null as AiMenuAnchor | null);

export function anchorOf(element: Element): AiMenuAnchor {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left };
}

export const showLinkMenuAtom = atom(false);

export type LightboxRequest = {
  src: string;
  type: "image" | "video";
} | null;

const initialLightboxRequest: LightboxRequest = null;
export const lightboxRequestAtom = atom(initialLightboxRequest);

// Current page's edit mode — initialized from the user's saved preference on
// first load, can be toggled locally without persisting to the server.
export const currentPageEditModeAtom = atom<PageEditMode>(PageEditMode.Edit);
