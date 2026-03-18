const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { listUsers } = require('../controllers/userController');

const router = express.Router();

router.use(authenticate);
router.get('/', listUsers);

module.exports = router;
