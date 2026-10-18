const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err.errors) {
        const errorDetails = err.errors.map(e => `${e.path.join('.') || 'field'}: ${e.message}`).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validation error: ${errorDetails}`,
          errors: err.errors
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Validation failed'
      });
    }
  };
};

module.exports = { validate };
