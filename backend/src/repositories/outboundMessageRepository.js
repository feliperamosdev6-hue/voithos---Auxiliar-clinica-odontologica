const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const outboundMessageRepository = {
  create: async (input) => prisma.outboundMessage.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toNullableString(input?.patientId),
      appointmentId: toNullableString(input?.appointmentId),
      channel: toRequiredString(input?.channel, 'channel'),
      type: toRequiredString(input?.type, 'type'),
      phone: toRequiredString(input?.phone, 'phone'),
      body: toRequiredString(input?.body, 'body'),
      status: toRequiredString(input?.status, 'status'),
      provider: toRequiredString(input?.provider, 'provider'),
      providerMessageId: toNullableString(input?.providerMessageId),
      lastError: toNullableString(input?.lastError),
    },
  }),

  findById: async (id) => prisma.outboundMessage.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByIdAndClinic: async ({ id, clinicId }) => prisma.outboundMessage.findFirst({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  listByClinic: async ({ clinicId, limit = 50 }) => prisma.outboundMessage.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 100),
  }),

  listReminderMessagesForAppointmentDay: async ({ clinicId, appointmentId, start, end }) => prisma.outboundMessage.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      appointmentId: toRequiredString(appointmentId, 'appointmentId'),
      type: 'APPOINTMENT_REMINDER',
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  findLatestReplyEnabledByClinicAndPhone: async ({ clinicId, phone }) => prisma.outboundMessage.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      phone: toRequiredString(phone, 'phone'),
      appointmentId: {
        not: null,
      },
      type: {
        in: ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER'],
      },
      status: {
        in: ['QUEUED', 'SENT'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  updateStatus: async ({ id, clinicId, status, providerMessageId, lastError }) => prisma.outboundMessage.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      status: toRequiredString(status, 'status'),
      providerMessageId: providerMessageId === undefined ? undefined : toNullableString(providerMessageId),
      lastError: lastError === undefined ? undefined : toNullableString(lastError),
    },
  }),

  updateBody: async ({ id, clinicId, body }) => prisma.outboundMessage.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      body: toRequiredString(body, 'body'),
    },
  }),
};

module.exports = { outboundMessageRepository };
