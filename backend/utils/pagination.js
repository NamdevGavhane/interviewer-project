/**
 * Standard Pagination Helper (O4)
 * Parses page & limit, applies safe caps, computes skip, and formats response metadata
 */
const getPagination = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query?.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  const formatMeta = (total) => {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  };

  return {
    page,
    limit,
    skip,
    formatMeta
  };
};

module.exports = { getPagination };
