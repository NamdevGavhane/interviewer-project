const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      const issues = err.issues || err.errors;
      if (issues && Array.isArray(issues)) {
        const errorDetails = issues.map(e => `${(e.path && e.path.join('.')) || 'field'}: ${e.message}`).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validation error: ${errorDetails}`,
          errors: issues
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
