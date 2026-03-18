const { AppError } = require('../errors/AppError');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { patientRepository } = require('../repositories/patientRepository');
const {
  assertRecordBelongsToClinic,
  sanitizeTenantInput,
} = require('../utils/tenantScope');

const isMissingTableError = (error) => error && error.code === 'P2021';
const VALID_STATUSES = new Set(['AGENDADO', 'CONFIRMADO', 'CANCELADO', 'REMARCAR']);

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

const ensurePatientBelongsToClinic = async (clinicId, patientId) => {
  const patient = await patientRepository.findById(patientId);
  return assertRecordBelongsToClinic(patient, clinicId, 'PATIENT_NOT_FOUND');
};

const appointmentService = {
  listAppointments: async ({ clinicId, from, to }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    try {
      return await appointmentRepository.listByClinic({
        clinicId: normalizedClinicId,
        from,
        to,
      });
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  },

  getAppointmentById: async ({ clinicId, id }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      const appointment = await appointmentRepository.findById(normalizedId);
      return assertRecordBelongsToClinic(appointment, normalizedClinicId, 'APPOINTMENT_NOT_FOUND');
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  },

  createAppointment: async ({ clinicId, input }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const patientId = String(sanitizedInput?.patientId || '').trim();
    const dataHora = sanitizedInput?.dataHora;
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!patientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'patientId is required.');
    }
    if (!dataHora) {
      throw new AppError(400, 'VALIDATION_ERROR', 'dataHora is required.');
    }

    try {
      await ensurePatientBelongsToClinic(normalizedClinicId, patientId);
      return await appointmentRepository.create({
        clinicId: normalizedClinicId,
        patientId,
        profissionalId: sanitizedInput?.profissionalId,
        profissionalNome: sanitizedInput?.profissionalNome,
        dataHora,
        horaFim: sanitizedInput?.horaFim,
        status: 'AGENDADO',
        confirmado: false,
        tipo: sanitizedInput?.tipo,
        observacoes: sanitizedInput?.observacoes,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateAppointmentStatus: async ({ clinicId, id, status }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const normalizedStatus = normalizeStatus(status);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!VALID_STATUSES.has(normalizedStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid.');
    }

    try {
      const current = await appointmentRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'APPOINTMENT_NOT_FOUND');

      const result = await appointmentRepository.updateStatus({
        id: normalizedId,
        clinicId: normalizedClinicId,
        status: normalizedStatus,
        confirmado: normalizedStatus === 'CONFIRMADO',
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return appointmentRepository.findById(normalizedId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateAppointment: async ({ clinicId, id, input }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const normalizedStatus = normalizeStatus(sanitizedInput?.status || 'AGENDADO');
    const normalizedPatientId = String(sanitizedInput?.patientId || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!VALID_STATUSES.has(normalizedStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid.');
    }
    if (!sanitizedInput?.dataHora) {
      throw new AppError(400, 'VALIDATION_ERROR', 'dataHora is required.');
    }

    try {
      const current = await appointmentRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'APPOINTMENT_NOT_FOUND');

      const patientId = normalizedPatientId || current?.patientId;
      await ensurePatientBelongsToClinic(normalizedClinicId, patientId);

      const result = await appointmentRepository.update({
        id: normalizedId,
        clinicId: normalizedClinicId,
        data: {
          profissionalId: sanitizedInput?.profissionalId,
          profissionalNome: sanitizedInput?.profissionalNome,
          dataHora: sanitizedInput?.dataHora,
          horaFim: sanitizedInput?.horaFim,
          tipo: sanitizedInput?.tipo,
          observacoes: sanitizedInput?.observacoes,
          status: normalizedStatus,
          confirmado: normalizedStatus === 'CONFIRMADO',
        },
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return appointmentRepository.findById(normalizedId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  deleteAppointment: async ({ clinicId, id }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      const current = await appointmentRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'APPOINTMENT_NOT_FOUND');

      const result = await appointmentRepository.delete({
        id: normalizedId,
        clinicId: normalizedClinicId,
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return { success: true };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },
};

module.exports = { VALID_STATUSES, appointmentService };
