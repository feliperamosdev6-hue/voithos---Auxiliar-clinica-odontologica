const { patientClinicalService } = require('../services/patientClinicalService');

const getPatientClinicalRecord = async (req, res, next) => {
  try {
    const data = await patientClinicalService.getClinicalRecord({
      clinicId: String(req.query?.clinicId || '').trim(),
      patientId: req.params.patientId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPatientProcedures = async (req, res, next) => {
  try {
    const data = await patientClinicalService.listProcedures({
      clinicId: String(req.query?.clinicId || '').trim(),
      patientId: req.params.patientId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const upsertPatientProcedure = async (req, res, next) => {
  try {
    const data = await patientClinicalService.upsertProcedure({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      procedure: req.body?.procedure || req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deletePatientProcedure = async (req, res, next) => {
  try {
    const data = await patientClinicalService.deleteProcedure({
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      externalId: String(req.params.externalId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPatientDocuments = async (req, res, next) => {
  try {
    const data = await patientClinicalService.listDocuments({
      clinicId: String(req.query?.clinicId || '').trim(),
      patientId: req.params.patientId,
      includeArchived: String(req.query?.includeArchived || '').trim() === 'true',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const upsertPatientDocument = async (req, res, next) => {
  try {
    const data = await patientClinicalService.upsertDocumentMetadata({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      document: req.body?.document || req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createPatientAnamnesis = async (req, res, next) => {
  try {
    const data = await patientClinicalService.createAnamnesis({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      data: req.body?.data || {},
      sourceDocument: req.body?.document || null,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPatientAnamneses = async (req, res, next) => {
  try {
    const data = await patientClinicalService.listAnamneses({
      clinicId: String(req.query?.clinicId || '').trim(),
      patientId: req.params.patientId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createPatientClinicalNote = async (req, res, next) => {
  try {
    const data = await patientClinicalService.createClinicalNote({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      noteType: req.body?.noteType || 'EVOLUCAO',
      content: req.body?.content || {},
      sourceDocument: req.body?.document || null,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updatePatientClinicalNote = async (req, res, next) => {
  try {
    const data = await patientClinicalService.updateClinicalNoteBySourceDocument({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      sourceDocumentId: String(req.params.sourceDocumentId || '').trim(),
      content: req.body?.content || {},
      sourceDocument: req.body?.document || null,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getPatientClinicalRecord,
  listPatientProcedures,
  upsertPatientProcedure,
  deletePatientProcedure,
  listPatientDocuments,
  upsertPatientDocument,
  createPatientAnamnesis,
  listPatientAnamneses,
  createPatientClinicalNote,
  updatePatientClinicalNote,
};
