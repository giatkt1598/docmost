import { ReactNode } from "react";
import { Container } from "@mantine/core";
import { useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { useFullWidth } from "@/features/base/hooks/use-full-width";

// Content width of a regular page: 900px, or the full width when the user
// turned on "full page width" (the same rule as the page editor's Container,
// so a base follows the setting like any other page).
export const PAGE_CONTENT_WIDTH = 900;

export function pageContentSize(fullPageWidth: boolean | undefined) {
  return fullPageWidth ? undefined : PAGE_CONTENT_WIDTH;
}

type Props = {
  children: ReactNode;
  // the base shown: its personal "Full width" switch makes the container fluid
  pageId?: string;
  // take the height of the parent (a base page with its own scrolling)
  fill?: boolean;
};

// Centers its children at the page content width. A table or board inside
// scrolls horizontally within this box instead of widening the page.
export function PageWidthContainer({ children, pageId, fill = false }: Props) {
  const user = useAtomValue(userAtom);
  const [baseFullWidth] = useFullWidth(pageId);
  const full = !!user?.settings?.preferences?.fullPageWidth || baseFullWidth;
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
