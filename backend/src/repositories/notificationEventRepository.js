const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const notificationEventRepository = {
  create: async (input) => prisma.notificationEvent.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      appointmentId: toNullableString(input?.appointmentId),
      patientId: toNullableString(input?.patientId),
      phone: toNullableString(input?.phone),
      type: toRequiredString(input?.type, 'type'),
      payload: input?.payload ?? null,
    },
  }),

  listByClinic: async ({ clinicId, type, limit = 50 }) => prisma.notificationEvent.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      type: type ? toRequiredString(type, 'type') : undefined,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 100),
  }),
};

module.exports = { notificationEventRepository };
