const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const clinicRepository = {
  findById: async (id) => prisma.clinic.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByEmail: async (email) => {
    const normalizedEmail = toNullableString(email);
    if (!normalizedEmail) return null;

    return prisma.clinic.findFirst({
      where: { email: normalizedEmail },
    });
  },

  create: async (input) => prisma.clinic.create({
    data: {
      nomeFantasia: toRequiredString(input?.nomeFantasia, 'nomeFantasia'),
      razaoSocial: toNullableString(input?.razaoSocial),
      cnpjCpf: toNullableString(input?.cnpjCpf),
      email: toNullableString(input?.email),
      telefoneComercial: toNullableString(input?.telefoneComercial),
      endereco: toNullableString(input?.endereco),
    },
  }),

  list: async () => prisma.clinic.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  }),
};

module.exports = { clinicRepository };
