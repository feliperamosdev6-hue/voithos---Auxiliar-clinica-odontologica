const { notificationEventRepository } = require('../repositories/notificationEventRepository');

const notificationEventService = {
  create: async (payload) => notificationEventRepository.create(payload),
  listByClinic: async ({ clinicId, type, limit }) => notificationEventRepository.listByClinic({
    clinicId,
    type,
    limit,
  }),
};

module.exports = { notificationEventService };
