const express = require('express');
const { listClinics } = require('../controllers/clinicController');

const router = express.Router();

router.get('/', listClinics);

module.exports = router;
