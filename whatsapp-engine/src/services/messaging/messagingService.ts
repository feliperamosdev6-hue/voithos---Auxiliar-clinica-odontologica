import { MessageEventType, MessageJobStatus } from '@prisma/client';
import { instanceRepository } from '../../repositories/instanceRepository';
import { messageJobRepository } from '../../repositories/messageJobRepository';
import { messageLogRepository } from '../../repositories/messageLogRepository';
import { createBodySummary, operationalEventRepository } from '../../repositories/operationalEventRepository';
import { enqueueMessageJob } from '../../queues/messageQueue';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { HttpError } from '../../utils/http';
import { normalizeBrPhone } from '../../utils/phone';

const dispatchMessageThroughApi = async (payload: { instanceId: string; toPhone: string; body: string }) => {
  const baseUrl = `http://127.0.0.1:${env.port}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.serviceInternalApiToken) {
    headers['x-service-token'] = env.serviceInternalApiToken;
  } else if (env.internalApiToken) {
    headers['x-internal-token'] = env.internalApiToken;
  }

  const response = await fetch(`${baseUrl}/instances/${encodeURIComponent(payload.instanceId)}/messages/send-internal`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      toPhone: payload.toPhone,
      body: payload.body,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new HttpError(response.status || 502, result?.error?.message || 'Internal API dispatch failed.');
  }

  return result.data as {
    providerMessageId?: string | null;
    remoteJid?: string | null;
  };
};

const isRuntimeUnavailableError = (error: unknown): boolean => {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode)
    : 0;
  const message = error instanceof Error ? error.message : String(error || '');
  return statusCode === 409
    || /runtime is unavailable|runtime socket is closed|connection closed during send|instance is not connected/i.test(message);
};

export const messagingService = {
  createAndEnqueueJob: async (payload: {
    clinicId: string;
    toPhone: string;
    body: string;
    auditBody?: string;
    appointmentId?: string;
    scheduledFor?: Date | null;
  }) => {
    const clinicId = String(payload.clinicId || '').trim();
    const normalizedTo = normalizeBrPhone(payload.toPhone);
    const body = String(payload.body || '').trim();
    if (!clinicId) throw new HttpError(400, 'clinicId is required.');
    if (!normalizedTo) throw new HttpError(400, 'toPhone is invalid.');
    if (!body) throw new HttpError(400, 'body is required.');

    const instance = await instanceRepository.findByClinicId(clinicId);
    if (!instance) throw new HttpError(404, 'No WhatsApp instance for this clinic.');

    const scheduledFor = payload.scheduledFor || null;
    const status = scheduledFor ? MessageJobStatus.SCHEDULED : MessageJobStatus.QUEUED;
    const created = await messageJobRepository.create({
      clinicId,
      instanceId: instance.id,
      appointmentId: payload.appointmentId,
      toPhone: normalizedTo,
      body: String(payload.auditBody || body).trim() || body,
      scheduledFor,
      status,
    });

    await messageLogRepository.create({
      jobId: created.id,
      eventType: MessageEventType.QUEUED,
      payload: {
        clinicId,
        instanceId: instance.id,
        toPhone: normalizedTo,
        scheduledFor,
      },
    });

    const dispatchSummary = createBodySummary(body);
    const storedSummary = createBodySummary(payload.auditBody || body);
    await operationalEventRepository.append({
      eventType: 'MESSAGE_JOB_CREATED',
      clinicId,
      instanceId: instance.id,
      phone: normalizedTo,
      status,
      messageJobId: created.id,
      appointmentId: payload.appointmentId || null,
      summary: `job created for ${normalizedTo}`,
      payload: {
        transport: scheduledFor ? 'queue' : 'sync',
        storedBodyPreview: storedSummary.preview,
      },
    });
    await operationalEventRepository.append({
      eventType: 'MESSAGE_PAYLOAD_COMPOSED',
      clinicId,
      instanceId: instance.id,
      phone: normalizedTo,
      status,
      messageJobId: created.id,
      appointmentId: payload.appointmentId || null,
      summary: storedSummary.preview,
      payload: {
        containsLinks: dispatchSummary.containsLinks,
        dispatchBodyLength: dispatchSummary.length,
        storedBodyPreview: storedSummary.preview,
      },
    });

    const delayMs = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0;
    await enqueueMessageJob({ jobId: created.id }, { delayMs });

    return created;
  },

  createAndDispatchJob: async (payload: {
    clinicId: string;
    toPhone: string;
    body: string;
    auditBody?: string;
    appointmentId?: string;
  }) => {
    const created = await messagingService.createAndEnqueueJob(payload);
    const result = await messagingService.processQueuedJob(created.id, 1, {
      dispatchBody: payload.body,
    });
    return {
      jobId: created.id,
      clinicId: created.clinicId,
      instanceId: created.instanceId,
      status: result.status,
      providerMessageId: result.providerMessageId || null,
      createdAt: created.createdAt,
      updatedAt: result.updatedAt,
    };
  },

  processQueuedJob: async (jobId: string, attemptCount: number, options?: { dispatchBody?: string }) => {
    const msgJob = await messageJobRepository.findById(jobId);
    if (!msgJob) throw new HttpError(404, 'Message job not found.');

    const instance = await instanceRepository.findById(msgJob.instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found for message job.');
    if (instance.clinicId !== msgJob.clinicId) {
      throw new HttpError(409, 'Cross-clinic instance usage detected.');
    }

    if (instance.status !== 'CONNECTED') {
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.BLOCKED, {
        lastError: 'Instance disconnected. Blocking send until reconnection.',
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_BLOCKED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: MessageJobStatus.BLOCKED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'instance disconnected before dispatch',
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType: MessageEventType.FAILED,
        payload: {
          reason: 'INSTANCE_DISCONNECTED',
          instanceStatus: instance.status,
          attemptCount,
        },
      });
      throw new HttpError(409, 'Instance disconnected.');
    }

    await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.PROCESSING, {
      retryCount: Math.max(0, attemptCount - 1),
    });
    await operationalEventRepository.append({
      eventType: 'MESSAGE_STATUS_UPDATED',
      clinicId: msgJob.clinicId,
      instanceId: msgJob.instanceId,
      phone: msgJob.toPhone,
      status: MessageJobStatus.PROCESSING,
      messageJobId: msgJob.id,
      appointmentId: msgJob.appointmentId || null,
      summary: 'message job moved to processing',
    });
    await messageLogRepository.create({
      jobId: msgJob.id,
      eventType: MessageEventType.PROCESSING,
      payload: {
        attemptCount,
      },
    });

    try {
      const dispatchBody = String(options?.dispatchBody || msgJob.body || '').trim();
      const dispatchSummary = createBodySummary(dispatchBody);
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_STARTED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.PROCESSING,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: dispatchSummary.preview,
        payload: {
          containsLinks: dispatchSummary.containsLinks,
          dispatchBodyLength: dispatchSummary.length,
        },
      });
      logger.info({
        jobId: msgJob.id,
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
      }, 'dispatching queued message through internal api');
      const provider = await dispatchMessageThroughApi({
        instanceId: instance.id,
        toPhone: msgJob.toPhone,
        body: dispatchBody,
      });
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.SENT);
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_ACCEPTED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.SENT,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'provider accepted dispatch',
        payload: {
          providerMessageId: provider.providerMessageId || null,
        },
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_STATUS_UPDATED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.SENT,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'message job marked as sent',
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        providerMessageId: provider.providerMessageId || undefined,
        eventType: MessageEventType.SENT,
        payload: {
          remoteJid: provider.remoteJid,
          attemptCount,
        },
      });
      const updated = await messageJobRepository.findById(msgJob.id);
      return {
        status: MessageJobStatus.SENT,
        providerMessageId: provider.providerMessageId || null,
        updatedAt: updated?.updatedAt || new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send error';
      const runtimeUnavailable = isRuntimeUnavailableError(error);
      const eventType = runtimeUnavailable
        ? MessageEventType.FAILED
        : attemptCount > 1
          ? MessageEventType.RETRYING
          : MessageEventType.FAILED;
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType,
        payload: {
          error: message,
          attemptCount,
          runtimeUnavailable,
        },
      });
      await messageJobRepository.updateStatus(
        msgJob.id,
        runtimeUnavailable ? MessageJobStatus.BLOCKED : MessageJobStatus.FAILED,
        {
          retryCount: Math.max(0, attemptCount),
          lastError: message,
        },
      );
      await operationalEventRepository.append({
        eventType: runtimeUnavailable ? 'MESSAGE_DISPATCH_BLOCKED' : 'MESSAGE_STATUS_UPDATED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: runtimeUnavailable ? MessageJobStatus.BLOCKED : MessageJobStatus.FAILED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: message,
      });
      throw error;
    }
  },
};
