require('dotenv').config();
const { initializeFirebase } = require('../config/firebase');
const ApiKey = require('../models/ApiKey');
const cryptoUtils = require('../utils/cryptoUtils');

/**
 * Script to generate a new API key
 * Usage: node scripts/generateApiKey.js [description]
 */
async function generateApiKey() {
    try {
        // Initialize Firebase (provides Firestore)
        initializeFirebase();
        console.log('✅ Connected to Firestore\n');

        // Get description from command line args or use default
        const description = process.argv[2] || 'Default API Key';

        // Generate new API key
        const apiKey = cryptoUtils.generateApiKey();
        console.log('🔑 Generated API Key:', apiKey);
        console.log('📝 Description:', description);
        console.log('');

        // Save to database
        const hashedKey = await ApiKey.save(apiKey, description);
        console.log('✅ API key saved to database');
        console.log('🔐 Hashed Key:', hashedKey);
        console.log('');
        console.log('⚠️  IMPORTANT: Save this API key securely. It cannot be retrieved later!');
        console.log('📋 Use this key in the X-API-Key header for API requests.');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error generating API key:', error);
        process.exit(1);
    }
}

generateApiKey();
