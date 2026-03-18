const { clinicService } = require('../services/clinicService');

const listClinics = async (_req, res, next) => {
  try {
    const clinics = await clinicService.list();
    return res.status(200).json({
      ok: true,
      data: clinics,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listClinics,
};
