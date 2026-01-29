# User Migration Flow: Firebase to MongoDB

## Overview

This document explains the migration flow for existing Firebase users to MongoDB. The system allows users to continue using Firebase authentication initially, then prompts them to set a password and migrate their data to MongoDB.

## Migration Flow

### Step 1: User Logs In with Firebase (Frontend)

The user logs in using Firebase Authentication as usual:

```javascript
// Frontend code
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const firebaseToken = await userCredential.user.getIdToken();
```

### Step 2: Frontend Checks Migration Status

After Firebase login, frontend calls the backend to check if user needs migration:

**Endpoint:** `POST /api/migration/check-status`

**Request:**

```json
{
  "firebaseToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

**Response (Needs Migration):**

```json
{
  "success": true,
  "data": {
    "needsMigration": true,
    "message": "User not found in MongoDB. Migration required.",
    "firebaseUserId": "firebase_uid_123",
    "email": "user@example.com"
  }
}
```

**Response (Already Migrated):**

```json
{
  "success": true,
  "data": {
    "needsMigration": false,
    "message": "User already migrated",
    "user": { ... }
  }
}
```

### Step 3: User Sets Password (Migration)

If migration is needed, frontend prompts user to enter a new password:

**Endpoint:** `POST /api/migration/setup-password`

**Request:**

```json
{
  "firebaseToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password set successfully. User migrated to MongoDB.",
  "data": {
    "user": {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "emailAddress": "user@example.com",
      "accountNumber": "000012345678",
      ...
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Step 4: Future Logins Use MongoDB

After migration, users can login directly with MongoDB:

**Endpoint:** `POST /api/auth/login`

**Request:**

```json
{
  "emailAddress": "user@example.com",
  "password": "newSecurePassword123"
}
```

## Complete Frontend Flow Example

```javascript
// 1. Login with Firebase first
const firebaseUserCredential = await signInWithEmailAndPassword(
  auth,
  email,
  password
);
const firebaseToken = await firebaseUserCredential.user.getIdToken();

// 2. Check migration status
const statusResponse = await fetch(
  "http://localhost:4000/api/migration/check-status",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebaseToken }),
  }
);

const statusData = await statusResponse.json();

if (statusData.data.needsMigration) {
  // 3. Show password setup screen
  const newPassword = await promptUserForPassword();

  // 4. Setup password and migrate
  const migrateResponse = await fetch(
    "http://localhost:4000/api/migration/setup-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firebaseToken,
        password: newPassword,
        confirmPassword: newPassword,
      }),
    }
  );

  const migrateData = await migrateResponse.json();

  // 5. Store MongoDB JWT token
  localStorage.setItem("authToken", migrateData.data.token);
  // User is now migrated!
} else {
  // User already migrated, use MongoDB login
  const loginResponse = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailAddress: email,
      password: password,
    }),
  });

  const loginData = await loginResponse.json();
  localStorage.setItem("authToken", loginData.data.token);
}
```

## API Endpoints

### 1. Check Migration Status

**Endpoint:** `POST /api/migration/check-status`

**Request Body:**

```json
{
  "firebaseToken": "firebase_id_token"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "needsMigration": true,
    "message": "User not found in MongoDB. Migration required.",
    "firebaseUserId": "uid",
    "email": "user@example.com"
  }
}
```

### 2. Setup Password (Migrate User)

**Endpoint:** `POST /api/migration/setup-password`

**Request Body:**

```json
{
  "firebaseToken": "firebase_id_token",
  "password": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password set successfully. User migrated to MongoDB.",
  "data": {
    "user": { ... },
    "token": "jwt_token"
  }
}
```

### 3. Login (Hybrid Flow)

**Endpoint:** `POST /api/auth/login`

**Request Body (MongoDB Login):**

```json
{
  "emailAddress": "user@example.com",
  "password": "password123"
}
```

**Request Body (Firebase Migration Flow):**

```json
{
  "emailAddress": "user@example.com",
  "firebaseToken": "firebase_id_token"
}
```

**Response (Needs Migration):**

```json
{
  "success": false,
  "needsMigration": true,
  "message": "Please set your password to complete migration",
  "data": {
    "firebaseUserId": "uid",
    "email": "user@example.com"
  }
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { ... },
    "token": "jwt_token",
    "migrated": true
  }
}
```

## What Gets Migrated

When a user migrates, the following data is copied from Firebase Firestore to MongoDB:

- Personal Information: firstName, lastName, emailAddress
- Account Information: accountNumber, accountType, kycApproved
- Financial Data: All wallet amounts, balances, crypto balances
- Agent Information: agentNumber, agentCode, refferedAgent
- Metadata: createdAt, accumulatedPoints, etc.
- Pending Referrals: If user has pending referral data

## Migration Process Details

1. **Firebase Token Verification**: Backend verifies the Firebase ID token
2. **User Data Retrieval**: Fetches user data from Firebase Firestore
3. **Password Hashing**: New password is hashed using bcrypt
4. **MongoDB Storage**: User data is stored in MongoDB with hashed password
5. **Agent Sync**: If user is an agent, agent record is created/updated
6. **JWT Token**: Returns MongoDB JWT token for future authentication

## Environment Variables Required

Add to `.env` file:

```env
# Firebase Admin SDK (for migration)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d
```

## Security Features

- Firebase tokens are verified before migration
- Passwords are hashed with bcrypt before storage
- Email uniqueness is enforced
- Password strength validation (minimum 6 characters)
- User data integrity maintained during migration

## Error Handling

### Invalid Firebase Token

```json
{
  "success": false,
  "error": "Invalid Firebase token"
}
```

### User Already Migrated

```json
{
  "success": false,
  "error": "User already migrated. Please use regular login."
}
```

### User Not Found in Firebase

```json
{
  "success": false,
  "error": "User data not found in Firebase"
}
```

## Testing the Migration Flow

### 1. Test Check Migration Status

```bash
curl -X POST http://localhost:4000/api/migration/check-status \
  -H "Content-Type: application/json" \
  -d '{
    "firebaseToken": "your_firebase_id_token"
  }'
```

### 2. Test Password Setup

```bash
curl -X POST http://localhost:4000/api/migration/setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "firebaseToken": "your_firebase_id_token",
    "password": "newPassword123",
    "confirmPassword": "newPassword123"
  }'
```

### 3. Test Login After Migration

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "user@example.com",
    "password": "newPassword123"
  }'
```

## Frontend Integration Guide

### Step 1: After Firebase Login

```javascript
// After successful Firebase login
const firebaseToken = await user.getIdToken();

// Check if migration needed
const response = await fetch(`${API_URL}/api/migration/check-status`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ firebaseToken }),
});

const { data } = await response.json();

if (data.needsMigration) {
  // Show password setup modal/screen
  showPasswordSetupModal(firebaseToken);
}
```

### Step 2: Password Setup Screen

```javascript
async function handlePasswordSetup(firebaseToken, password, confirmPassword) {
  const response = await fetch(`${API_URL}/api/migration/setup-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firebaseToken,
      password,
      confirmPassword,
    }),
  });

  const result = await response.json();

  if (result.success) {
    // Store MongoDB JWT token
    await AsyncStorage.setItem("authToken", result.data.token);
    // User migrated successfully!
    navigateToHome();
  }
}
```

### Step 3: Future Logins

```javascript
// Check if user has MongoDB token first
const mongoToken = await AsyncStorage.getItem("authToken");

if (mongoToken) {
  // Use MongoDB login
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailAddress, password }),
  });
} else {
  // Use Firebase login + migration flow
  // ... (Step 1 above)
}
```

## Notes

- Users can continue using Firebase auth until they set a password
- Once password is set, future logins use MongoDB
- Firebase UID is stored in MongoDB for reference
- Migration is one-time process per user
- All user data is preserved during migration
- Agent data is automatically synced if user is an agent
