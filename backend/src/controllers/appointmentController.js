const { appointmentService } = require('../services/appointmentService');
const { outboundMessageService } = require('../services/outboundMessageService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listAppointments = async (req, res, next) => {
  try {
    const data = await appointmentService.listAppointments({
      clinicId: getAuthenticatedClinicId(req),
      from: req.query.from,
      to: req.query.to,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await appointmentService.getAppointmentById({
      clinicId: getAuthenticatedClinicId(req),
      id: req.params.id,
    });
    return res.status(200).json({
      ok: true,
      data: appointment,
    });
  } catch (error) {
    return next(error);
  }
};

const createAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.createAppointment({
      clinicId: getAuthenticatedClinicId(req),
      input: req.body || {},
    });
    return res.status(201).json({
      ok: true,
      data: appointment,
    });
  } catch (error) {
    return next(error);
  }
};

const updateAppointmentStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateAppointmentStatus({
      clinicId: getAuthenticatedClinicId(req),
      id: req.params.id,
      status: req.body?.status,
    });
    return res.status(200).json({
      ok: true,
      data: appointment,
    });
  } catch (error) {
    return next(error);
  }
};

const updateAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateAppointment({
      clinicId: getAuthenticatedClinicId(req),
      id: req.params.id,
      input: req.body || {},
    });
    return res.status(200).json({
      ok: true,
      data: appointment,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteAppointment = async (req, res, next) => {
  try {
    const result = await appointmentService.deleteAppointment({
      clinicId: getAuthenticatedClinicId(req),
      id: req.params.id,
    });
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const sendAppointmentConfirmation = async (req, res, next) => {
  try {
    const data = await outboundMessageService.sendAppointmentConfirmation({
      clinicId: getAuthenticatedClinicId(req),
      appointmentId: req.params.id,
    });
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const sendAppointmentReminder = async (req, res, next) => {
  try {
    const data = await outboundMessageService.sendAppointmentReminder({
      clinicId: getAuthenticatedClinicId(req),
      appointmentId: req.params.id,
    });
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  updateAppointment,
  deleteAppointment,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
};
