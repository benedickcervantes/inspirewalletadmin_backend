const { z } = require('zod');

const minPasswordLength = Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);

const trimmedString = (min = 1, max = 255) =>
    z.string().trim().min(min).max(max);

const optionalTrimmed = (max = 255) =>
    z.string().trim().max(max).optional();

const agentCodeValue = z.string().trim().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);

const numericQuery = (min, max) => z.preprocess(
    (value) => {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? value : parsed;
    },
    z.number().int().min(min).max(max).optional()
);

const booleanQuery = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
};

const registerSchema = z.object({
    firstName: trimmedString(1, 80),
    lastName: trimmedString(1, 80),
    emailAddress: z.string().trim().email().max(254),
    password: z.string().min(minPasswordLength).max(128),
    confirmPassword: z.string().min(minPasswordLength).max(128).optional(),
    agentNumber: optionalTrimmed(10),
    agentCode: optionalTrimmed(30),
    refferedAgent: optionalTrimmed(30),
    agent: z.boolean().optional(),
    userId: optionalTrimmed(128),
    pendingReferral: z.record(z.any()).optional()
}).refine((data) => {
    if (!data.confirmPassword) return true;
    return data.password === data.confirmPassword;
}, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
});

const loginSchema = z.object({
    emailAddress: z.string().trim().email().max(254).optional(),
    email: z.string().trim().email().max(254).optional(),
    password: z.string().min(1).max(128).optional(),
    firebaseToken: z.string().min(1).optional()
}).refine((data) => data.emailAddress || data.email, {
    message: 'Email is required',
    path: ['emailAddress']
});

const migrationCheckSchema = z.object({
    firebaseToken: z.string().min(1)
});

const migrationSetupSchema = z.object({
    firebaseToken: z.string().min(1),
    password: z.string().min(minPasswordLength).max(128),
    confirmPassword: z.string().min(minPasswordLength).max(128)
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
});

const firebaseLoginSchema = z.object({
    firebaseToken: z.string().min(1)
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1).optional()
});

const userListQuerySchema = z.object({
    page: numericQuery(1, 100000),
    limit: numericQuery(1, 100),
    search: optionalTrimmed(120),
    status: optionalTrimmed(40),
    kycStatus: optionalTrimmed(40),
    agent: z.preprocess(booleanQuery, z.boolean().optional()),
    isDummyAccount: z.preprocess(booleanQuery, z.boolean().optional()),
    accountType: optionalTrimmed(40),
    sortBy: z.enum(['createdAt', 'lastLogin', 'lastSignedIn', 'emailAddress', 'accountNumber']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
});

const userIdParamsSchema = z.object({
    id: trimmedString(1, 128)
});

const userEmailParamsSchema = z.object({
    email: z.string().trim().email().max(254)
});

const userProfileUpdateSchema = z.object({
    firstName: trimmedString(1, 80).optional(),
    lastName: trimmedString(1, 80).optional(),
    preferredLanguage: optionalTrimmed(40)
}).refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
    path: ['firstName']
});

const userSubcollectionParamsSchema = z.object({
    name: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/)
});

const userSubcollectionQuerySchema = z.object({
    page: numericQuery(1, 100000),
    limit: numericQuery(1, 200),
    sortBy: optionalTrimmed(60),
    sortOrder: z.enum(['asc', 'desc']).optional()
});

const subcollectionQuerySchema = z.object({
    page: numericQuery(1, 100000),
    limit: numericQuery(1, 100),
    status: optionalTrimmed(40),
    sortBy: z.enum(['createdAt', 'date', 'applicationDate', 'travelDate', 'updatedAt', 'amount', 'submittedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
});

const firebaseCollectionParamsSchema = z.object({
    collection: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/)
});

const firebaseCollectionQuerySchema = z.object({
    page: numericQuery(1, 100000),
    limit: numericQuery(1, 200),
    status: optionalTrimmed(40),
    sortBy: optionalTrimmed(60),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    search: optionalTrimmed(120),
    includeUser: z.preprocess(
        (value) => {
            if (value === undefined || value === null || value === '') return undefined;
            if (value === true || value === false) return value;
            if (value === 'true') return true;
            if (value === 'false') return false;
            return value;
        },
        z.boolean().optional()
    )
});

const agentGenerateSchema = z.object({
    referrerCode: agentCodeValue,
    agentNumber: z.string().trim().regex(/^[A-Z0-9]{5}$/)
});

const agentCodeParamsSchema = z.object({
    agentCode: agentCodeValue
});

const parseNumericInput = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().replace(/,/g, '');
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
};

const numericInputSchema = z.preprocess(
    parseNumericInput,
    z.number().finite()
);

const nonNegativeNumericSchema = z.preprocess(
    parseNumericInput,
    z.number().finite().min(0)
);

const positiveNumericSchema = z.preprocess(
    parseNumericInput,
    z.number().finite().positive()
);

const percentageNumericSchema = z.preprocess(
    parseNumericInput,
    z.number().finite().min(0).max(100)
);

const timeDepositTermSchema = z.enum(['sixMonths', 'oneYear', 'twoYears']);

const validDateStringSchema = z
    .string()
    .trim()
    .min(1, 'Initial date is required')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Initial date must be a valid date')
    .refine((value) => {
        const selectedDate = new Date(value);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        return selectedDate.getTime() <= endOfToday.getTime();
    }, 'Initial date cannot be in the future');

const timeDepositReferralSchema = z.object({
    referrerUserId: trimmedString(1, 128),
    commissionPercentage: percentageNumericSchema.optional(),
    mode: z.enum(['manual', 'hierarchy']).optional()
});

const timeDepositContractSchema = z.object({
    enabled: z.boolean().optional(),
    strict: z.boolean().optional()
}).optional();

const timeDepositQuoteBodySchema = z.object({
    amount: nonNegativeNumericSchema,
    term: timeDepositTermSchema,
    initialDate: validDateStringSchema.optional(),
    finalInterestRate: nonNegativeNumericSchema.optional(),
    referral: timeDepositReferralSchema.optional()
});

const timeDepositCreateBodySchema = z.object({
    amount: positiveNumericSchema,
    term: timeDepositTermSchema,
    initialDate: validDateStringSchema,
    finalInterestRate: nonNegativeNumericSchema.optional(),
    referral: timeDepositReferralSchema.optional(),
    contract: timeDepositContractSchema
});

const timeDepositCreateParamsSchema = z.object({
    id: trimmedString(1, 128)
});

module.exports = {
    registerSchema,
    loginSchema,
    migrationCheckSchema,
    migrationSetupSchema,
    firebaseLoginSchema,
    refreshSchema,
    userListQuerySchema,
    userIdParamsSchema,
    userEmailParamsSchema,
    userProfileUpdateSchema,
    userSubcollectionParamsSchema,
    userSubcollectionQuerySchema,
    subcollectionQuerySchema,
    firebaseCollectionParamsSchema,
    firebaseCollectionQuerySchema,
    agentGenerateSchema,
    agentCodeParamsSchema,
    timeDepositTermSchema,
    timeDepositReferralSchema,
    timeDepositQuoteBodySchema,
    timeDepositCreateBodySchema,
    timeDepositCreateParamsSchema
};
