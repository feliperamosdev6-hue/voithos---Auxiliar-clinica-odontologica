const { getAuthenticatedClinicId } = require('../utils/authContext');
const { notificationEventService } = require('../services/notificationEventService');

const listNotificationEvents = async (req, res, next) => {
  try {
    const data = await notificationEventService.listByClinic({
      clinicId: getAuthenticatedClinicId(req),
      type: req.query.type,
      limit: req.query.limit,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listNotificationEvents };
