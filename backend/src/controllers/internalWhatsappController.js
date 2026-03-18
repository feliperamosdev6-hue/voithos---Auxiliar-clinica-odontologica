const { inboundMessageService } = require('../services/inboundMessageService');

const receiveInboundWhatsapp = async (req, res, next) => {
  try {
    const data = await inboundMessageService.receiveWhatsappInbound(req.body || {});
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const listInternalInboundWhatsapp = async (req, res, next) => {
  try {
    const data = await inboundMessageService.listRecent({
      clinicId: req.query.clinicId,
      status: req.query.status,
      intent: req.query.intent,
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

module.exports = { receiveInboundWhatsapp, listInternalInboundWhatsapp };
