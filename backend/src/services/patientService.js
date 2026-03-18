const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { assertRecordBelongsToClinic, sanitizeTenantInput } = require('../utils/tenantScope');

const isMissingTableError = (error) => error && error.code === 'P2021';
const isForeignKeyError = (error) => error && error.code === 'P2003';

const patientService = {
  listByClinic: async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      return await patientRepository.listByClinic(normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },

  findById: async (id) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      return await patientRepository.findById(normalizedId);
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  },

  findByIdForClinic: async (id, clinicId) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    try {
      const patient = await patientRepository.findById(normalizedId);
      return assertRecordBelongsToClinic(patient, normalizedClinicId, 'PATIENT_NOT_FOUND');
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  },

  create: async (input) => {
    const clinicId = String(input?.clinicId || '').trim();
    const nome = String(input?.nome || '').trim();

    if (!clinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      return await patientRepository.create({
        clinicId,
        nome,
        cpf: input?.cpf,
        rg: input?.rg,
        dataNascimento: input?.dataNascimento,
        telefone: input?.telefone,
        email: input?.email,
        endereco: input?.endereco,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  createForClinic: async (clinicId, input) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const nome = String(sanitizedInput?.nome || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      return await patientRepository.create({
        clinicId: normalizedClinicId,
        nome,
        cpf: sanitizedInput?.cpf,
        rg: sanitizedInput?.rg,
        dataNascimento: sanitizedInput?.dataNascimento,
        telefone: sanitizedInput?.telefone,
        email: sanitizedInput?.email,
        endereco: sanitizedInput?.endereco,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateForClinic: async ({ id, clinicId, input }) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const nome = String(sanitizedInput?.nome || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      const current = await patientRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'PATIENT_NOT_FOUND');

      const result = await patientRepository.update({
        id: normalizedId,
        clinicId: normalizedClinicId,
        data: {
          nome,
          cpf: sanitizedInput?.cpf,
          rg: sanitizedInput?.rg,
          dataNascimento: sanitizedInput?.dataNascimento,
          telefone: sanitizedInput?.telefone,
          email: sanitizedInput?.email,
          endereco: sanitizedInput?.endereco,
        },
      });

      if (!result.count) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
      }

      return patientRepository.findById(normalizedId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  deleteForClinic: async ({ id, clinicId }) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      const current = await patientRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'PATIENT_NOT_FOUND');

      const result = await patientRepository.delete({
        id: normalizedId,
        clinicId: normalizedClinicId,
      });

      if (!result.count) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
      }

      return { success: true };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      if (isForeignKeyError(error)) {
        throw new AppError(409, 'PATIENT_HAS_APPOINTMENTS', 'Patient has linked appointments.');
      }
      throw error;
    }
  },
};

module.exports = { patientService };
