import { Injectable } from '@nestjs/common';
import { UnfurlResult } from '../../registry/integration-provider.interface';
import { providerApiFetch } from '../../utils/provider-fetch';

// What Sprint Boot's bridge answers for a ticket.
export type SprintBootTicket = {
  key: string;
  title: string;
  url: string;
  status: string;
  statusCategory: 'todo' | 'inProgress' | 'done';
  type: string;
  typeIcon: string;
  priority: string;
  assignee?: string | null;
  assigneeAvatarUrl?: string | null;
  spaceKey: string;
  archived: boolean;
};

export type SprintBootSpace = {
  key: string;
  name: string;
  docmostSpaceId?: string | null;
};

export type SprintBootPageLinks = {
  pageId: string;
  title?: string;
  url?: string;
  spaceName?: string;
  urls?: string[];
  deleted?: boolean;
};

const STATUS_COLORS: Record<SprintBootTicket['statusCategory'], string> = {
  todo: 'gray',
  inProgress: 'blue',
  done: 'green',
};

// Sprint Boot's bridge for Docmost: every call carries the secret Sprint Boot handed out.
@Injectable()
export class SprintBootService {
  async verifyToken(token: string, baseUrl: string): Promise<void> {
    await this.post(token, baseUrl, 'unfurl', { keys: [] });
  }

  async getTickets(
    token: string,
    baseUrl: string,
    body: { keys?: string[]; urls?: string[] },
  ): Promise<SprintBootTicket[]> {
    const data = await this.post(token, baseUrl, 'unfurl', body);
    return data.tickets ?? [];
  }

  async unfurlTicket(
    token: string,
    baseUrl: string,
    key: string,
    url: string,
  ): Promise<UnfurlResult> {
    const [ticket] = await this.getTickets(token, baseUrl, { keys: [key] });
    if (!ticket) {
      throw new Error(`Sprint Boot ticket ${key} not found`);
    }
    return toUnfurl(ticket, url);
  }

  async setPageLinks(
    token: string,
    baseUrl: string,
    links: SprintBootPageLinks,
  ): Promise<void> {
    await this.post(token, baseUrl, 'page-links', links);
  }

  async search(
    token: string,
    baseUrl: string,
    body: { actorEmail: string; text?: string; spaceKey?: string; limit?: number },
  ): Promise<SprintBootTicket[]> {
    const data = await this.post(token, baseUrl, 'search', body);
    return data.tickets ?? [];
  }

  async createTicket(
    token: string,
    baseUrl: string,
    body: {
      actorEmail: string;
      spaceKey: string;
      type?: string;
      title: string;
      description?: string;
    },
  ): Promise<SprintBootTicket> {
    return this.post(token, baseUrl, 'tickets', body);
  }

  async getSpaces(
    token: string,
    baseUrl: string,
    actorEmail: string,
  ): Promise<SprintBootSpace[]> {
    const data = await this.post(token, baseUrl, 'spaces', { actorEmail });
    return data.spaces ?? [];
  }

  private async post(
    token: string,
    baseUrl: string,
    path: string,
    body: unknown,
  ): Promise<any> {
    const response = await providerApiFetch(
      'Sprint Boot',
      `${baseUrl}/api/v1/docs-bridge/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Docmost',
        },
        body: JSON.stringify(body),
      },
    );
    return response.json();
  }
}

export function toUnfurl(ticket: SprintBootTicket, url: string): UnfurlResult {
  return {
    title: `${ticket.key} ${ticket.title}`,
    description: [ticket.type, ticket.priority].filter(Boolean).join(' · '),
    url,
    provider: 'sprint-boot',
    providerIcon: 'sprint-boot',
    status: ticket.status,
    statusColor: STATUS_COLORS[ticket.statusCategory] ?? 'gray',
    author: ticket.assignee ?? undefined,
    authorAvatarUrl: ticket.assigneeAvatarUrl ?? undefined,
    metadata: {
      type: 'ticket',
      ticketKey: ticket.key,
      ticketType: ticket.type,
      spaceKey: ticket.spaceKey,
      archived: ticket.archived,
    },
  };
}
