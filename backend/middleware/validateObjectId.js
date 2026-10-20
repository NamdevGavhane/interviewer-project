const mongoose = require('mongoose');

/**
 * Middleware factory to validate that specified route params are valid MongoDB ObjectIds.
 * Default checks req.params.id if no param names are specified.
 */
const validateObjectId = (...paramNames) => {
  const paramsToCheck = paramNames.length > 0 ? paramNames : ['id'];
  return (req, res, next) => {
    for (const param of paramsToCheck) {
      const val = req.params[param];
      if (val && !mongoose.Types.ObjectId.isValid(val)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ID parameter "${param}": "${val}" is not a valid ObjectId.`
        });
      }
    }
    next();
  };
};

module.exports = { validateObjectId };
