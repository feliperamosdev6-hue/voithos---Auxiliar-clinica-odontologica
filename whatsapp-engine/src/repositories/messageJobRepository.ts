import { MessageJob, MessageJobStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type CreateMessageJobInput = {
  clinicId: string;
  instanceId: string;
  appointmentId?: string;
  toPhone: string;
  body: string;
  scheduledFor?: Date | null;
  status: MessageJobStatus;
};

export const messageJobRepository = {
  create: async (input: CreateMessageJobInput): Promise<MessageJob> => prisma.messageJob.create({
    data: {
      clinicId: input.clinicId,
      instanceId: input.instanceId,
      appointmentId: input.appointmentId || null,
      toPhone: input.toPhone,
      body: input.body,
      scheduledFor: input.scheduledFor || null,
      status: input.status,
    },
  }),

  findById: async (id: string): Promise<MessageJob | null> => prisma.messageJob.findUnique({ where: { id } }),

  findRecent: async (filters: {
    clinicId?: string;
    instanceId?: string;
    status?: MessageJobStatus;
    search?: string;
    limit?: number;
  }) => {
    const search = String(filters.search || '').trim();
    const limit = Math.min(Math.max(filters.limit || 50, 1), 100);

    return prisma.messageJob.findMany({
      where: {
        clinicId: filters.clinicId || undefined,
        instanceId: filters.instanceId || undefined,
        status: filters.status || undefined,
        OR: search ? [
          { clinicId: { contains: search, mode: 'insensitive' } },
          { instanceId: { contains: search, mode: 'insensitive' } },
          { toPhone: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
          { lastError: { contains: search, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  },

  countByStatusSince: async (since: Date) => {
    const jobs = await prisma.messageJob.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: {
        _all: true,
      },
    });

    return jobs.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
  },

  updateStatus: async (id: string, status: MessageJobStatus, extra?: { lastError?: string; retryCount?: number }): Promise<void> => {
    await prisma.messageJob.update({
      where: { id },
      data: {
        status,
        lastError: extra?.lastError,
        retryCount: extra?.retryCount,
      },
    });
  },
};
