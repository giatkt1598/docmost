export type SpaceTreeNode = {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  position: string;
  spaceId: string;
  parentPageId: string;
  hasChildren: boolean;
  isBase?: boolean;
  hasPassword?: boolean;
  // this browser holds a valid unlock: the lock shows open
  passwordUnlocked?: boolean;
  canEdit?: boolean;
  children: SpaceTreeNode[];
};
