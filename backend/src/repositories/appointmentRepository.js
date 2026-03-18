const { prisma } = require('../db/prisma');
const { toNullableString, toOptionalDate, toRequiredString } = require('../types/repositoryTypes');

const appointmentRepository = {
  findById: async (id) => prisma.appointment.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByIdAndClinic: async (id, clinicId) => prisma.appointment.findFirst({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  listByClinic: async ({ clinicId, from, to }) => {
    const where = {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    };

    const fromDate = from ? toOptionalDate(from) : null;
    const toDate = to ? toOptionalDate(to) : null;
    if (fromDate || toDate) {
      where.dataHora = {};
      if (fromDate) where.dataHora.gte = fromDate;
      if (toDate) where.dataHora.lte = toDate;
    }

    return prisma.appointment.findMany({
      where,
      orderBy: {
        dataHora: 'asc',
      },
    });
  },

  create: async (input) => prisma.appointment.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toRequiredString(input?.patientId, 'patientId'),
      profissionalId: toNullableString(input?.profissionalId),
      profissionalNome: toNullableString(input?.profissionalNome),
      dataHora: toOptionalDate(input?.dataHora),
      horaFim: toOptionalDate(input?.horaFim),
      status: toRequiredString(input?.status, 'status'),
      confirmado: input?.confirmado === true,
      tipo: toNullableString(input?.tipo),
      observacoes: toNullableString(input?.observacoes),
    },
  }),

  update: async ({ id, clinicId, data }) => prisma.appointment.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      profissionalId: toNullableString(data?.profissionalId),
      profissionalNome: toNullableString(data?.profissionalNome),
      dataHora: toOptionalDate(data?.dataHora),
      horaFim: toOptionalDate(data?.horaFim),
      tipo: toNullableString(data?.tipo),
      observacoes: toNullableString(data?.observacoes),
      status: toRequiredString(data?.status, 'status'),
      confirmado: data?.confirmado === true,
    },
  }),

  delete: async ({ id, clinicId }) => prisma.appointment.deleteMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  updateStatus: async ({ id, clinicId, status, confirmado }) => prisma.appointment.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      status: toRequiredString(status, 'status'),
      confirmado: confirmado === true,
    },
  }),

  listByPatient: async ({ clinicId, patientId }) => prisma.appointment.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      patientId: toRequiredString(patientId, 'patientId'),
    },
    orderBy: {
      dataHora: 'asc',
    },
  }),
};

module.exports = { appointmentRepository };
