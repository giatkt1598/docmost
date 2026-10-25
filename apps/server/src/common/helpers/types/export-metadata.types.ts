export type ExportPageMetadata = {
  pageId: string;
  slugId: string;
  icon: string | null;
  position: string;
  parentPath: string | null;
  // the page is a base; its data sits next to it in `<name>.base.json`
  isBase?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExportMetadata = {
  exportedAt: string;
  source: 'docmost';
  version: string;
  pages: Record<string, ExportPageMetadata>;
};
