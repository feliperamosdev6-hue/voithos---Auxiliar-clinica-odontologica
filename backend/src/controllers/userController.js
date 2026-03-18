const { userService } = require('../services/userService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listUsers = async (req, res, next) => {
  try {
    const users = await userService.listByClinic(getAuthenticatedClinicId(req));
    return res.json({
      ok: true,
      data: users,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listUsers,
};
