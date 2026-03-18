const express = require('express');
const { listInternalInboundWhatsapp, receiveInboundWhatsapp } = require('../controllers/internalWhatsappController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/inbound', listInternalInboundWhatsapp);
router.post('/inbound', receiveInboundWhatsapp);

module.exports = router;
