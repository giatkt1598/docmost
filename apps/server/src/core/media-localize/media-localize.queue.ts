import { Queue } from 'bullmq';
import { QueueJob } from '../../integrations/queue/constants';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { hasExternalMedia } from './external-media.util';

// Kept apart from MediaLocalizeService: collab code imports this, and the
// service depends on the collab gateway.

export type LocalizeMediaJob = { pageId: string };

// Queues a copy job when page content still points at external media.
export async function enqueueMediaLocalize(
  queue: Queue,
  environmentService: EnvironmentService,
  pageId: string,
  content: any,
  delayMs = 2000,
) {
  if (!environmentService.isMediaLocalizeEnabled()) return;
  if (!hasExternalMedia(content, environmentService.getAppUrl())) return;
  await queue.add(
    QueueJob.LOCALIZE_PAGE_MEDIA,
    { pageId } as LocalizeMediaJob,
    // collapse bursts of saves; an overlapping run is harmless because nodes
    // already pointing at a copy are skipped and unused copies are deleted
    {
      delay: delayMs,
      deduplication: { id: `localize-media-${pageId}`, ttl: 5000 },
    },
  );
}
