const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.CONTRACT_SERVICE_TIMEOUT_MS || '10000', 10);

const createHttpError = (status, message, code) => {
    const error = new Error(message);
    error.status = status;
    if (code) {
        error.code = code;
    }
    return error;
};

const normalizeServiceUrl = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
};

const withTimeout = async (url, options, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
};

const parseErrorPayload = async (response) => {
    try {
        const data = await response.json();
        if (data && typeof data === 'object') {
            return data.error || data.message || '';
        }
        return '';
    } catch (_) {
        return '';
    }
};

const mapServiceError = (error) => {
    if (error.name === 'AbortError') {
        return createHttpError(504, 'Contract service timeout reached', 'CONTRACT_TIMEOUT');
    }

    if (error.status) {
        return error;
    }

    return createHttpError(502, error.message || 'Contract service is unavailable', 'CONTRACT_SERVICE_UNAVAILABLE');
};

const generateTimeDepositContract = async ({
    userId,
    amount,
    term,
    rate,
    initialDate,
    completionDate,
    displayId,
    requestId,
    serviceUrl,
    timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
    const baseUrl = normalizeServiceUrl(serviceUrl || process.env.CONTRACT_SERVICE_URL || '');

    if (!baseUrl) {
        throw createHttpError(400, 'Contract service URL is not configured', 'CONTRACT_SERVICE_URL_MISSING');
    }

    const payload = {
        requestId: requestId || crypto.randomUUID(),
        userId,
        amount,
        term,
        rate,
        initialDate,
        completionDate,
        displayId
    };

    try {
        const response = await withTimeout(`${baseUrl}/contracts/time-deposit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }, timeoutMs);

        if (!response.ok) {
            const serviceMessage = await parseErrorPayload(response);

            if (response.status === 404) {
                throw createHttpError(502, serviceMessage || 'Contract endpoint not found', 'CONTRACT_ENDPOINT_NOT_FOUND');
            }

            if (response.status >= 500) {
                throw createHttpError(502, serviceMessage || 'Contract service failed to process request', 'CONTRACT_SERVICE_ERROR');
            }

            throw createHttpError(400, serviceMessage || 'Invalid contract request payload', 'CONTRACT_BAD_REQUEST');
        }

        const data = await response.json();

        if (!data || !data.contractId) {
            throw createHttpError(502, 'Contract service returned an invalid payload', 'CONTRACT_INVALID_RESPONSE');
        }

        return {
            contractId: data.contractId,
            urls: {
                view: data.urls?.view || null,
                download: data.urls?.download || null,
                pdf: data.urls?.pdf || null
            },
            expiresAt: data.expiresAt || null
        };
    } catch (error) {
        throw mapServiceError(error);
    }
};

module.exports = {
    generateTimeDepositContract
};