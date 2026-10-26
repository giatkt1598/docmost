import { Space } from '@docmost/db/types/entity.types';

export class SearchResponseDto {
  id: string;
  title: string;
  icon: string;
  parentPageId: string;
  creatorId: string;
  rank: number;
  highlight: string;
  matchedText: string[];
  wholeWord: boolean;
  // found by meaning rather than by the words of the query
  semantic?: boolean;
  createdAt: Date;
  updatedAt: Date;
  space: Partial<Space>;
}
