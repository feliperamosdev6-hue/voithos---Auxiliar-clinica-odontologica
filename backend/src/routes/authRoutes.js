const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');

const router = express.Router();

router.post('/login', login);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);

module.exports = router;
