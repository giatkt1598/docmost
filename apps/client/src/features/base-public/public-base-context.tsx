import { createContext, useContext } from "react";

// How a signed-out viewer reaches a base: through a public share or a
// published space. `hostPageId` is the shared page that embeds the base.
export type PublicBaseAccess = {
  shareId?: string;
  spaceSlug?: string;
  hostPageId?: string;
};

export const PublicBaseContext = createContext<PublicBaseAccess | null>(null);

// Null inside the signed-in app, where bases use the regular endpoints.
export function usePublicBaseAccess(): PublicBaseAccess | null {
  return useContext(PublicBaseContext);
}
