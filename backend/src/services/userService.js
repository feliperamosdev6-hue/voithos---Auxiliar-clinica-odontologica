const { AppError } = require('../errors/AppError');
const { userRepository } = require('../repositories/userRepository');

const isMissingTableError = (error) => error && error.code === 'P2021';

const userService = {
  listByClinic: async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      return await userRepository.listByClinic(normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },
};

module.exports = { userService };
