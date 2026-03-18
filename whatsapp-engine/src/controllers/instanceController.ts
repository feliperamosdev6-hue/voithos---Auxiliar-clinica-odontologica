import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/http';
import { instanceService } from '../services/instance/instanceService';

const createInstanceSchema = z.object({
  clinicId: z.string().min(1),
  displayName: z.string().min(1).max(160).optional(),
  pairingPhone: z.string().min(8).optional(),
});

const instanceLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const internalDispatchMessageSchema = z.object({
  toPhone: z.string().min(8),
  body: z.string().min(1).max(4096),
});

export const createInstance = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createInstanceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const created = await instanceService.create(parsed.data);
  res.status(201).json({
    success: true,
    data: {
      id: created.id,
      clinicId: created.clinicId,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
});

export const listInstances = asyncHandler(async (_req: Request, res: Response) => {
  const result = await instanceService.listInstances();
  res.json({
    success: true,
    data: result,
  });
});

export const getInstanceDetails = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const instance = await instanceService.getInstanceDetails(instanceId);
  res.json({
    success: true,
    data: instance,
  });
});

export const getInstanceStatus = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const status = await instanceService.getStatus(instanceId);
  res.json({
    success: true,
    data: status,
  });
});

export const getInstanceQr = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');
  const qr = await instanceService.getQrPayload(instanceId);
  res.json({
    success: true,
    data: qr,
  });
});

export const disconnectInstance = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const result = await instanceService.disconnect(instanceId);
  res.json({
    success: true,
    data: result,
  });
});

export const deleteInstance = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const result = await instanceService.remove(instanceId);
  res.json({
    success: true,
    data: result,
  });
});

export const getInstanceLogs = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const parsed = instanceLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const logs = await instanceService.getRecentLogs(instanceId, parsed.data.limit || 20);
  res.json({
    success: true,
    data: logs,
  });
});

export const dispatchInstanceMessage = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const parsed = internalDispatchMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const result = await instanceService.sendText(instanceId, parsed.data.toPhone, parsed.data.body);
  res.json({
    success: true,
    data: result,
  });
});
