import { ReactNode } from "react";
import { Container } from "@mantine/core";
import { useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";

// Content width of a regular page: 900px, or the full width when the user
// turned on "full page width" (the same rule as the page editor's Container,
// so a base follows the setting like any other page).
export const PAGE_CONTENT_WIDTH = 900;

export function pageContentSize(fullPageWidth: boolean | undefined) {
  return fullPageWidth ? undefined : PAGE_CONTENT_WIDTH;
}

type Props = {
  children: ReactNode;
  // the active view wants the whole content area ("Full width")
  fullWidth?: boolean;
  // take the height of the parent (a base page with its own scrolling)
  fill?: boolean;
};

// Centers its children at the page content width. A table or board inside
// scrolls horizontally within this box instead of widening the page.
export function PageWidthContainer({ children, fullWidth = false, fill = false }: Props) {
  const user = useAtomValue(userAtom);
  const full = !!user?.settings?.preferences?.fullPageWidth || fullWidth;
  return (
    <Container
      fluid={full}
      size={pageContentSize(full)}
      w="100%"
      style={{
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        ...(fill ? { flex: 1, minHeight: 0 } : {}),
      }}
    >
      {children}
    </Container>
  );
}
