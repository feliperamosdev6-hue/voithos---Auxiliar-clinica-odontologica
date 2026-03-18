import { MessageEventType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { messageLogRepository } from '../repositories/messageLogRepository';
import { operationalEventRepository } from '../repositories/operationalEventRepository';
import { centralBackendService } from '../services/integration/centralBackendService';
import { asyncHandler, HttpError } from '../utils/http';

const listRecentLogsQuerySchema = z.object({
  clinicId: z.string().optional(),
  instanceId: z.string().optional(),
  eventType: z.nativeEnum(MessageEventType).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const listOperationalEventsQuerySchema = z.object({
  clinicId: z.string().optional(),
  instanceId: z.string().optional(),
  eventType: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const maskToken = (token: string): string => {
  if (!token) return 'Nao configurado';
  if (token.length <= 8) return `${token.slice(0, 2)}****${token.slice(-1)}`;
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
};

export const listRecentLogs = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listRecentLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const logs = await messageLogRepository.findRecent(parsed.data);
  res.json({
    success: true,
    data: logs,
  });
});

export const listOperationalEvents = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listOperationalEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const events = await operationalEventRepository.listRecent(parsed.data);
  res.json({
    success: true,
    data: events,
  });
});

export const getWebhookOverview = asyncHandler(async (_req: Request, res: Response) => {
  const recentInbound = await centralBackendService.listRecentInboundWhatsapp({ limit: 12 }).catch(() => []);

  res.json({
    success: true,
    data: {
      baseUrl: env.centralBackendBaseUrl || '',
      configured: Boolean(env.centralBackendBaseUrl && env.centralBackendServiceToken),
      supportsPerInstanceConfig: false,
      supportedEvents: [
        'connected',
        'disconnected',
        'message received',
        'message sent',
        'error',
      ],
      recentDeliveries: recentInbound.map((item: any) => ({
        event: item.intent === 'APPOINTMENT_CONFIRMATION'
          ? 'message received'
          : item.intent === 'APPOINTMENT_RESCHEDULE'
            ? 'message received'
            : 'message received',
        clinicId: item.clinicId,
        timestamp: item.createdAt,
        targetUrl: env.centralBackendBaseUrl || '',
        fromPhone: item.fromPhone,
        appointmentId: item.appointmentId,
        status: item.status,
        intent: item.intent,
        bodyPreview: String(item.body || '').slice(0, 120),
      })),
      samplePayloads: {
        connected: {
          event: 'connected',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          timestamp: new Date().toISOString(),
        },
        disconnected: {
          event: 'disconnected',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          reason: 'runtime socket closed',
          timestamp: new Date().toISOString(),
        },
        'message received': {
          event: 'message received',
          clinicId: 'clinic-001',
          fromPhone: '5511999999999',
          body: '1',
          intent: 'APPOINTMENT_CONFIRMATION',
          appointmentId: 'appointment-123',
          timestamp: new Date().toISOString(),
        },
        'message sent': {
          event: 'message sent',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          to: '5511988887777',
          status: 'SENT',
        },
        error: {
          event: 'error',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          message: 'Instance disconnected.',
        },
      },
    },
  });
});

export const getSecurityOverview = (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      maskedInternalToken: maskToken(env.serviceInternalApiToken),
      hasInternalToken: Boolean(env.serviceInternalApiToken),
      maskedServiceToken: maskToken(env.serviceInternalApiToken),
      hasServiceToken: Boolean(env.serviceInternalApiToken),
      maskedAdminPanelToken: maskToken(env.adminPanelToken),
      hasAdminPanelToken: Boolean(env.adminPanelToken),
      adminSessions: {
        supported: true,
        summary: 'Painel com sessao assinada em cookie httpOnly; RBAC detalhado ainda nao foi implementado.',
      },
      ipAllowlist: {
        supported: false,
        summary: 'Allowlist de IP ainda nao foi implementada no engine.',
      },
      audit: {
        supported: false,
        summary: 'Auditoria basica ainda esta em fase de definicao.',
      },
      rotation: {
        supported: false,
        summary: 'Tokens de servico e painel agora sao separados, mas a rotacao coordenada ainda nao foi implementada.',
      },
    },
  });
};
