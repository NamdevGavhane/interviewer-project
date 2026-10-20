/**
 * Global async handler wrapper to catch and forward unhandled promise rejections to express error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
