const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Agent = require('../models/Agent');
const RefreshToken = require('../models/RefreshToken');
const agentService = require('./agentService');
const logger = require('../utils/logger');

const getBcryptCost = () => {
    const parsed = Number.parseInt(process.env.BCRYPT_COST || '12', 10);
    if (Number.isNaN(parsed)) {
        logger.warn('BCRYPT_COST is invalid. Falling back to 12.');
        return 12;
    }

    if (parsed < 10) {
        logger.warn('BCRYPT_COST is too low. Using minimum of 10.');
        return 10;
    }

    if (parsed > 15) {
        logger.warn('BCRYPT_COST is too high. Using maximum of 15.');
        return 15;
    }

    return parsed;
};

const getRefreshTokenTtlDays = () => {
    const parsed = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        logger.warn('REFRESH_TOKEN_TTL_DAYS is invalid. Falling back to 30.');
        return 30;
    }
    return parsed;
};

class AuthService {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'inspire-wallet-secret-key-change-in-production';
        this.jwtExpiry = process.env.JWT_EXPIRY || '7d';
        this.accessTokenTtl = process.env.ACCESS_TOKEN_TTL || this.jwtExpiry;
        this.refreshTokenTtlDays = getRefreshTokenTtlDays();
        this.jwtIssuer = process.env.JWT_ISSUER || '';
        this.jwtAudience = process.env.JWT_AUDIENCE || '';
        this.bcryptCost = getBcryptCost();

        if (this.jwtSecret.includes('change-in-production')) {
            logger.warn('JWT_SECRET is using the default value. Set a strong secret in production.');
        }
        if (this.jwtSecret.length < 32) {
            logger.warn('JWT_SECRET is shorter than 32 characters. Use a longer secret in production.');
        }
    }

    /**
     * Hash password
     * @param {string} password - Plain text password
     * @returns {Promise<string>} Hashed password
     */
    async hashPassword(password) {
        return await bcrypt.hash(password, this.bcryptCost);
    }

    /**
     * Compare password with hash
     * @param {string} password - Plain text password
     * @param {string} hash - Hashed password
     * @returns {Promise<boolean>} Match result
     */
    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Generate JWT token
     * @param {Object} payload - Token payload
     * @returns {string} JWT token
     */
    generateToken(payload) {
        const jwtId = crypto.randomUUID();
        const options = {
            expiresIn: this.accessTokenTtl,
            jwtid: jwtId
        };
        if (this.jwtIssuer) {
            options.issuer = this.jwtIssuer;
        }
        if (this.jwtAudience) {
            options.audience = this.jwtAudience;
        }
        return jwt.sign(payload, this.jwtSecret, options);
    }

    /**
     * Verify JWT token
     * @param {string} token - JWT token
     * @returns {Object} Decoded token payload
     */
    verifyToken(token) {
        try {
            const options = {};
            if (this.jwtIssuer) {
                options.issuer = this.jwtIssuer;
            }
            if (this.jwtAudience) {
                options.audience = this.jwtAudience;
            }
            return jwt.verify(token, this.jwtSecret, options);
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    hashRefreshToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async createRefreshToken(userId, metadata = {}) {
        const token = crypto.randomBytes(64).toString('hex');
        const tokenHash = this.hashRefreshToken(token);
        const expiresAt = new Date(Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

        await RefreshToken.create({
            tokenHash,
            userId,
            expiresAt,
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null
        });

        return { token, expiresAt };
    }

    async rotateRefreshToken(existingTokenHash, userId, metadata = {}) {
        const newToken = await this.createRefreshToken(userId, metadata);
        await RefreshToken.revoke(existingTokenHash, {
            replacedByTokenHash: this.hashRefreshToken(newToken.token),
            revokedByIp: metadata.ipAddress || null
        });
        return newToken;
    }

    async issueTokens(user, metadata = {}) {
        const userId = user.id || user.userId;
        const token = this.generateToken({
            userId,
            email: user.emailAddress,
            accountNumber: user.accountNumber,
            role: user.role || 'user'
        });
        const refreshToken = await this.createRefreshToken(userId, metadata);
        return {
            token,
            refreshToken: refreshToken.token,
            refreshTokenExpiresAt: refreshToken.expiresAt
        };
    }

    async refreshSession(refreshToken, metadata = {}) {
        if (!refreshToken) {
            throw new Error('Refresh token is required');
        }

        const tokenHash = this.hashRefreshToken(refreshToken);
        const storedToken = await RefreshToken.findByHash(tokenHash);

        if (!storedToken) {
            throw new Error('Refresh token is invalid');
        }

        if (storedToken.revokedAt) {
            await RefreshToken.revokeAllForUser(storedToken.userId);
            throw new Error('Refresh token is invalid');
        }

        if (storedToken.expiresAt && storedToken.expiresAt < new Date()) {
            throw new Error('Refresh token has expired');
        }

        const user = await User.findById(storedToken.userId);

        if (!user) {
            throw new Error('User not found');
        }

        const rotatedToken = await this.rotateRefreshToken(tokenHash, storedToken.userId, metadata);

        const userId = user.id || user.userId;
        const accessToken = this.generateToken({
            userId,
            email: user.emailAddress,
            accountNumber: user.accountNumber,
            role: user.role || 'user'
        });

        return {
            token: accessToken,
            refreshToken: rotatedToken.token,
            refreshTokenExpiresAt: rotatedToken.expiresAt
        };
    }

    async revokeRefreshToken(refreshToken, metadata = {}) {
        if (!refreshToken) {
            return;
        }
        const tokenHash = this.hashRefreshToken(refreshToken);
        await RefreshToken.revoke(tokenHash, {
            revokedByIp: metadata.ipAddress || null
        });
    }

    /**
     * Register a new user
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} Registration result
     */
    async register(userData, metadata = {}) {
        try {
            const {
                firstName,
                lastName,
                emailAddress,
                password,
                agentNumber,
                agentCode,
                refferedAgent,
                agent,
                userId, // Firebase UID if syncing
                pendingReferral
            } = userData;

            // Validate required fields
            if (!firstName || !lastName || !emailAddress || !password) {
                throw new Error('Missing required fields: firstName, lastName, emailAddress, password');
            }

            // Check if email already exists
            const emailExists = await User.emailExists(emailAddress);
            if (emailExists) {
                throw new Error('Email address already registered');
            }

            // Generate unique account number
            const accountNumber = await User.generateUniqueAccountNumber();

            // Hash password
            const hashedPassword = await this.hashPassword(password);

            // Prepare user document
            const now = new Date();
            const userDoc = {
                firstName,
                lastName,
                emailAddress: emailAddress.toLowerCase().trim(),
                password: hashedPassword, // Store hashed password
                accountNumber,
                agentNumber: agent ? (agentNumber || '0') : '0',
                agentCode: agent ? (agentCode || '0') : '0',
                refferedAgent: refferedAgent || '0',
                stockAmount: 0,
                walletAmount: 0,
                kycApproved: false,
                accountType: 'Basic',
                timeDepositAmount: 0,
                agentWalletAmount: 0,
                usdtAmount: 0,
                availBalanceAmount: 0,
                dollarDepositAmount: 0,
                dollarAvailBalanceAmount: 0,
                cryptoAvailBalanceAmount: 0,
                dollarWalletAmount: 0,
                cryptoWalletAmount: 0,
                accumulatedPoints: 10,
                agent: agent || false,
                stock: false,
                cryptoBalances: {
                    BTC: 0,
                    ETH: 0,
                    USDT: 0
                },
                currencyBalances: {
                    USD: 0,
                    JPY: 0
                },
                createdAt: now,
                lastSignedIn: now
            };

            // Add Firebase userId if provided (for sync)
            if (userId) {
                userDoc.userId = userId;
            }

            // Add pending referral data if exists
            if (pendingReferral) {
                userDoc.pendingReferral = pendingReferral;
            }

            // Create user in Firestore
            const user = await User.create(userDoc);

            // If user is an agent, also create/update agent record
            if (agent && agentCode && agentCode !== '0' && agentCode !== 'pending') {
                try {
                    const agentData = {
                        agentNumber: agentNumber || '0',
                        agentCode: agentCode,
                        userId: userId || user.id,
                        firstName,
                        lastName,
                        fullName: `${firstName} ${lastName}`,
                        referrerCode: pendingReferral?.referrerAgentCode || null,
                        referrerId: pendingReferral?.referrerId || null,
                        type: agentService.determineAgentType(agentCode),
                        commissionNumbers: agentService.getAgentNumbers(agentCode),
                        status: 'active'
                    };

                    // Check if agent already exists
                    const existingAgent = await Agent.findByCode(agentCode);
                    if (!existingAgent) {
                        await Agent.create(agentData);
                    }
                } catch (agentError) {
                    console.error('Error creating agent record:', agentError);
                    // Don't fail registration if agent creation fails
                }
            }

            const tokens = await this.issueTokens(user, metadata);

            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;

            return {
                success: true,
                user: userWithoutPassword,
                token: tokens.token,
                refreshToken: tokens.refreshToken,
                refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Login user (checks Firestore first, then Firebase for migration)
     * @param {string} email - Email address
     * @param {string} password - Plain text password
     * @param {string} firebaseToken - Optional Firebase ID token for migration flow
     * @returns {Promise<Object>} Login result
     */
    async login(email, password, firebaseToken = null, metadata = {}) {
        try {
            if (!email) {
                throw new Error('Email is required');
            }

            // Find user by email in Firestore
            const user = await User.findByEmail(email.toLowerCase().trim());

            // If user exists and has password, use Firestore auth
            if (user && user.password) {
                if (!password) {
                    throw new Error('Password is required');
                }

                // Compare passwords
                const passwordMatch = await this.comparePassword(password, user.password);
                if (!passwordMatch) {
                    throw new Error('Invalid email or password');
                }

                // Update last signed in
                await User.updateLastSignedIn(user.emailAddress);

                const tokens = await this.issueTokens(user, metadata);

                // Remove password from response
                const { password: _, ...userWithoutPassword } = user;

                return {
                    success: true,
                    user: userWithoutPassword,
                    token: tokens.token,
                    refreshToken: tokens.refreshToken,
                    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
                    migrated: false
                };
            }

            // If user doesn't exist or has no password, require Firebase token
            if (!firebaseToken) {
                throw new Error('User not found. Please login with Firebase first, then set your password.');
            }

            // Verify Firebase token
            const migrationService = require('./migrationService');
            const firebaseUser = await migrationService.verifyFirebaseUser(firebaseToken);

            // Check if email matches Firebase user
            if (firebaseUser.email?.toLowerCase() !== email.toLowerCase()) {
                throw new Error('Email does not match Firebase account');
            }

            const matchResult = migrationService.validateMongoUserMatch(firebaseUser, user);
            if (!matchResult.matches) {
                throw new Error(matchResult.message);
            }

            // User needs migration - return special response
            return {
                success: false,
                needsMigration: true,
                message: 'User needs to set password for migration',
                firebaseUserId: firebaseUser.uid,
                email: firebaseUser.email
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    /**
     * Login user with Firebase token and link/create Firestore record
     * @param {string} firebaseToken - Firebase ID token
     * @returns {Promise<Object>} Login result
     */
    async loginWithFirebaseToken(firebaseToken, metadata = {}) {
        try {
            if (!firebaseToken) {
                throw new Error('Firebase token is required');
            }

            const migrationService = require('./migrationService');
            const firebaseUser = await migrationService.verifyFirebaseUser(firebaseToken);

            if (!firebaseUser?.uid || !firebaseUser?.email) {
                throw new Error('Firebase token is missing user data');
            }

            const firebaseUserId = firebaseUser.uid;
            const firebaseEmail = firebaseUser.email.toLowerCase().trim();
            let user = await migrationService.checkUserExists(firebaseUserId, firebaseEmail);

            if (user && user.userId && user.userId !== firebaseUserId) {
                throw new Error('Firebase UID does not match existing user');
            }

            const now = new Date();

            if (!user) {
                const firebaseUserData = await migrationService.getFirebaseUserData(firebaseUserId);
                if (!firebaseUserData) {
                    throw new Error('User data not found in Firebase');
                }

                const userDoc = {
                    userId: firebaseUserId,
                    firstName: firebaseUserData.firstName || '',
                    lastName: firebaseUserData.lastName || '',
                    emailAddress: firebaseEmail,
                    accountNumber: firebaseUserData.accountNumber || await User.generateUniqueAccountNumber(),
                    agentNumber: firebaseUserData.agentNumber || '0',
                    agentCode: firebaseUserData.agentCode || '0',
                    refferedAgent: firebaseUserData.refferedAgent || '0',
                    stockAmount: firebaseUserData.stockAmount || 0,
                    walletAmount: firebaseUserData.walletAmount || 0,
                    kycApproved: firebaseUserData.kycApproved || false,
                    accountType: firebaseUserData.accountType || 'Basic',
                    timeDepositAmount: firebaseUserData.timeDepositAmount || 0,
                    agentWalletAmount: firebaseUserData.agentWalletAmount || 0,
                    usdtAmount: firebaseUserData.usdtAmount || 0,
                    availBalanceAmount: firebaseUserData.availBalanceAmount || 0,
                    dollarDepositAmount: firebaseUserData.dollarDepositAmount || 0,
                    dollarAvailBalanceAmount: firebaseUserData.dollarAvailBalanceAmount || 0,
                    cryptoAvailBalanceAmount: firebaseUserData.cryptoAvailBalanceAmount || 0,
                    dollarWalletAmount: firebaseUserData.dollarWalletAmount || 0,
                    cryptoWalletAmount: firebaseUserData.cryptoWalletAmount || 0,
                    accumulatedPoints: firebaseUserData.accumulatedPoints || 10,
                    agent: firebaseUserData.agent || false,
                    stock: firebaseUserData.stock || false,
                    cryptoBalances: firebaseUserData.cryptoBalances || {
                        BTC: 0,
                        ETH: 0,
                        USDT: 0
                    },
                    currencyBalances: firebaseUserData.currencyBalances || {
                        USD: 0,
                        JPY: 0
                    },
                    createdAt: firebaseUserData.createdAt?.toDate() || now,
                    lastSignedIn: now,
                    migratedFromFirebase: true,
                    migrationDate: now
                };

                if (firebaseUserData.pendingReferral) {
                    userDoc.pendingReferral = firebaseUserData.pendingReferral;
                }

                user = await User.create(userDoc);
            } else {
                const updateData = {
                    lastSignedIn: now,
                    updatedAt: now
                };

                if (!user.userId) {
                    updateData.userId = firebaseUserId;
                }

                if (!user.emailAddress || user.emailAddress.toLowerCase() !== firebaseEmail) {
                    updateData.emailAddress = firebaseEmail;
                }

                if (!user.migratedFromFirebase) {
                    updateData.migratedFromFirebase = true;
                }

                if (!user.migrationDate) {
                    updateData.migrationDate = now;
                }

                await User.updateById(user.id, updateData);
                user = await User.findById(user.id);
            }

            if (user?.agent && user.agentCode && user.agentCode !== '0' && user.agentCode !== 'pending') {
                try {
                    const existingAgent = await Agent.findByCode(user.agentCode);
                    if (!existingAgent) {
                        const agentData = {
                            agentNumber: user.agentNumber || '0',
                            agentCode: user.agentCode,
                            userId: user.userId || firebaseUserId,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            fullName: `${user.firstName} ${user.lastName}`,
                            referrerCode: user.pendingReferral?.referrerAgentCode || null,
                            referrerId: user.pendingReferral?.referrerId || null,
                            type: agentService.determineAgentType(user.agentCode),
                            commissionNumbers: agentService.getAgentNumbers(user.agentCode),
                            status: 'active'
                        };
                        await Agent.create(agentData);
                    }
                } catch (agentError) {
                    console.error('Error creating agent record:', agentError);
                }
            }

            const tokens = await this.issueTokens(user, metadata);

            const { password: _, ...userWithoutPassword } = user;

            return {
                success: true,
                user: userWithoutPassword,
                token: tokens.token,
                refreshToken: tokens.refreshToken,
                refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
            };
        } catch (error) {
            console.error('Firebase login error:', error);
            throw error;
        }
    }

    /**
     * Get user profile
     * @param {string} userId - User ID (Firestore doc ID)
     * @returns {Promise<Object>} User profile
     */
    async getProfile(userId) {
        try {
            const user = await User.findById(userId);

            if (!user) {
                throw new Error('User not found');
            }

            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            console.error('Get profile error:', error);
            throw error;
        }
    }
}

module.exports = new AuthService();
