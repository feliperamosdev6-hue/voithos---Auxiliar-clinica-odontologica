const { AppError } = require('../errors/AppError');
const { authService } = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const user = await authService.getCurrentUser(req.auth.token);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
    }

    return res.status(200).json({
      ok: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    await authService.logout(req.auth.token);
    return res.status(200).json({
      ok: true,
      data: {
        loggedOut: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  me,
  logout,
};
