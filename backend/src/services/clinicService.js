const { clinicRepository } = require('../repositories/clinicRepository');

const isMissingTableError = (error) => error && error.code === 'P2021';

const clinicService = {
  list: async () => {
    try {
      return await clinicRepository.list();
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },
};

module.exports = { clinicService };
