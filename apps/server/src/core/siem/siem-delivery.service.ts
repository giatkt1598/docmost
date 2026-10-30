import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SiemDestination } from '@docmost/db/types/entity.types';
import { SiemDestinationRepo } from '@docmost/db/repos/siem/siem-destination.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SiemDestinationDisabledEmail } from '@docmost/transactional/emails/siem-destination-disabled-email';
import { SiemDestinationFailingEmail } from '@docmost/transactional/emails/siem-destination-failing-email';
import { SiemDestinationRecoveredEmail } from '@docmost/transactional/emails/siem-destination-recovered-email';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { DomainService } from '../../integrations/environment/domain.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { NotificationType } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';
import { SiemConfig, SiemSecrets } from './siem-config';
import { applyFailure } from './siem-state';
import { SiemTransportService } from './siem-transport.service';
import {
  SIEM_BATCH_SIZE,
  SIEM_MAX_BATCHES_PER_RUN,
  SIEM_SETTLE_WINDOW_MS,
  SIEM_STATUS,
  SIEM_SWEEP_INTERVAL_MS,
  SiemType,
} from './siem.constants';

const SWEEP_SCHEDULER_ID = 'siem-sweep-scheduler';

type NoticeKind = 'failing' | 'disabled' | 'recovered';

@Injectable()
export class SiemDeliveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SiemDeliveryService.name);

  constructor(
    private readonly destinationRepo: SiemDestinationRepo,
    private readonly transport: SiemTransportService,
    private readonly encryption: EncryptionService,
    private readonly notificationService: NotificationService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly domainService: DomainService,
    @InjectQueue(QueueName.SIEM_QUEUE) private readonly siemQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.siemQueue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: SIEM_SWEEP_INTERVAL_MS },
      { name: QueueJob.SIEM_SWEEP, data: {} },
    );
  }

  async sweep(now: Date = new Date()): Promise<void> {
    const due = await this.destinationRepo.findDue(now);
    for (const { id } of due) {
      // the job id keeps one delivery per destination in flight
      await this.siemQueue.add(
        QueueJob.SIEM_DELIVER,
        { destinationId: id },
        { jobId: `siem-deliver-${id}` },
      );
    }
  }

  async deliver(destinationId: string): Promise<void> {
    const destination = await this.destinationRepo.findById(destinationId);
    if (!destination?.enabled) return;

    let cursor = {
      createdAt: new Date(destination.cursorCreatedAt),
      id: destination.cursorId,
    };
    const secrets = this.decryptSecrets(destination.secrets);
    let deliveredAny = false;

    try {
      for (let batch = 0; batch < SIEM_MAX_BATCHES_PER_RUN; batch++) {
        const settledBefore = new Date(Date.now() - SIEM_SETTLE_WINDOW_MS);
        const { events, last } = await this.destinationRepo.readEvents(
          destination.workspaceId,
          cursor,
          settledBefore,
          SIEM_BATCH_SIZE,
        );
        if (!last) break;

        await this.transport.send(
          destination.type as SiemType,
          destination.config as SiemConfig,
          secrets,
          events,
        );

        const stillCurrent = await this.destinationRepo.updateDelivery(
          destination.id,
          destination.version,
          {
            cursorCreatedAt: last.createdAt,
            cursorId: last.id,
            lastDeliveredAt: new Date(),
          },
        );
        if (!stillCurrent) return;

        cursor = last;
        deliveredAny = true;
        if (events.length < SIEM_BATCH_SIZE) break;
      }
    } catch (err) {
      await this.recordFailure(destination, (err as Error).message);
      return;
    }

    // Idle runs prove nothing about the destination, so they do not recover it.
    if (deliveredAny && destination.consecutiveFailures > 0) {
      await this.recordRecovery(destination);
    }
  }

  private async recordFailure(destination: SiemDestination, message: string) {
    const now = new Date();
    const { notify, ...state } = applyFailure(
      {
        status: destination.status,
        consecutiveFailures: destination.consecutiveFailures,
        failingSince: destination.failingSince
          ? new Date(destination.failingSince)
          : null,
      },
      now,
    );

    const updated = await this.destinationRepo.updateDelivery(
      destination.id,
      destination.version,
      { ...state, lastError: message, lastErrorAt: now },
    );
    this.logger.warn(`Delivery to ${destination.id} failed: ${message}`);
    if (updated && notify) {
      await this.notifyOwners(destination, notify, message, state.failingSince);
    }
  }

  private async recordRecovery(destination: SiemDestination) {
    const updated = await this.destinationRepo.updateDelivery(
      destination.id,
      destination.version,
      {
        status: SIEM_STATUS.HEALTHY,
        consecutiveFailures: 0,
        failingSince: null,
        nextAttemptAt: null,
        lastError: null,
        lastErrorAt: null,
      },
    );
    if (updated && destination.status === SIEM_STATUS.FAILING) {
      await this.notifyOwners(destination, 'recovered');
    }
  }

  private decryptSecrets(encrypted: string): SiemSecrets {
    return JSON.parse(
      this.encryption.decrypt(encrypted, EncryptionPurpose.SIEM_CREDENTIALS),
    );
  }

  // A notice is a courtesy: losing one must not disturb delivery state.
  private async notifyOwners(
    destination: SiemDestination,
    kind: NoticeKind,
    lastError = '',
    failingSince?: Date,
  ) {
    try {
      const workspace = await this.workspaceRepo.findById(
        destination.workspaceId,
      );
      const baseUrl = this.domainService.getUrl(workspace?.hostname ?? undefined);
      const props = {
        destinationName: destination.name,
        destinationType: destination.type,
        lastError,
        failingSince: failingSince?.toUTCString() ?? '',
        settingsLink: `${baseUrl}/settings/audit/siem`,
      };
      const notice = {
        failing: {
          type: NotificationType.SIEM_DESTINATION_FAILING,
          subject: `SIEM destination ${destination.name} is failing`,
          template: SiemDestinationFailingEmail(props),
        },
        disabled: {
          type: NotificationType.SIEM_DESTINATION_DISABLED,
          subject: `SIEM destination ${destination.name} was disabled`,
          template: SiemDestinationDisabledEmail(props),
        },
        recovered: {
          type: NotificationType.SIEM_DESTINATION_RECOVERED,
          subject: `SIEM destination ${destination.name} recovered`,
          template: SiemDestinationRecoveredEmail(props),
        },
      }[kind];

      const ownerIds = await this.destinationRepo.findOwnerIds(
        destination.workspaceId,
      );
      for (const userId of ownerIds) {
        const notification = await this.notificationService.create({
          userId,
          workspaceId: destination.workspaceId,
          type: notice.type,
          data: { destinationName: destination.name, lastError },
        });
        if (notification) {
          await this.notificationService.queueEmail(
            userId,
            notification.id,
            notice.subject,
            notice.template,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Could not notify about ${destination.id}: ${(err as Error).message}`,
      );
    }
  }
}
