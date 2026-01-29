const { ZodError } = require('zod');

const formatZodError = (error) => error.errors.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message
}));

const validateRequest = (schemas) => (req, res, next) => {
    try {
        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    details: formatZodError(result.error)
                });
            }
            req.body = result.data;
        }

        if (schemas.query) {
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid query parameters',
                    details: formatZodError(result.error)
                });
            }
            req.query = result.data;
        }

        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid route parameters',
                    details: formatZodError(result.error)
                });
            }
            req.params = result.data;
        }

        return next();
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                details: formatZodError(error)
            });
        }
        return next(error);
    }
};

module.exports = validateRequest;
