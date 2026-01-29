# Authentication API Documentation

## Overview

This API provides user registration, login, and profile management endpoints for the Inspire Wallet system. It uses JWT tokens for authentication and stores user data in MongoDB.

## Base URL

```
http://localhost:4000/api/auth
```

## Authentication

Protected routes require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

## API Endpoints

### 1. Register User

Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "emailAddress": "john.doe@example.com",
  "password": "securePassword123",
  "confirmPassword": "securePassword123",
  "agent": false,
  "agentNumber": "ABC12",
  "agentCode": "ABC12-00000-00000",
  "refferedAgent": "0",
  "pendingReferral": {
    "referrerId": "user123",
    "referrerName": "Jane Smith",
    "referrerAgentCode": "XYZ34-00000-00000",
    "status": "pending"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "emailAddress": "john.doe@example.com",
      "accountNumber": "000012345678",
      "accountType": "Basic",
      "kycApproved": false,
      "accumulatedPoints": 10,
      "createdAt": "2024-01-01T00:00:00.000Z",
      ...
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Missing required fields: firstName, lastName, emailAddress, password"
}
```

**Error Response (409 Conflict):**
```json
{
  "success": false,
  "error": "Email address already registered"
}
```

### 2. Login User

Authenticate user and get JWT token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "emailAddress": "john.doe@example.com",
  "password": "securePassword123"
}
```

**Alternative (also accepts `email` field):**
```json
{
  "email": "john.doe@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "emailAddress": "john.doe@example.com",
      "accountNumber": "000012345678",
      "accountType": "Basic",
      "lastSignedIn": "2024-01-01T00:00:00.000Z",
      ...
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

### 3. Get User Profile

Get authenticated user's profile (protected route).

**Endpoint:** `GET /api/auth/profile`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "emailAddress": "john.doe@example.com",
    "accountNumber": "000012345678",
    "accountType": "Basic",
    "kycApproved": false,
    "walletAmount": 0,
    "stockAmount": 0,
    "accumulatedPoints": 10,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastSignedIn": "2024-01-01T00:00:00.000Z",
    ...
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Authentication token required"
}
```

## User Data Structure

### Registration Fields

**Required:**
- `firstName` - User's first name
- `lastName` - User's last name
- `emailAddress` - Email address (must be unique)
- `password` - Password (minimum 6 characters)

**Optional:**
- `confirmPassword` - Password confirmation (validated if provided)
- `agent` - Boolean indicating if user is an agent
- `agentNumber` - 5-character agent number
- `agentCode` - Full hierarchical agent code
- `refferedAgent` - Referrer's agent number
- `userId` - Firebase UID (for syncing with Firebase)
- `pendingReferral` - Pending referral data object

### User Document Structure

```javascript
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  emailAddress: String (unique, indexed),
  password: String (hashed),
  accountNumber: String (unique, indexed, 12 digits),
  agentNumber: String,
  agentCode: String,
  refferedAgent: String,
  stockAmount: Number,
  walletAmount: Number,
  kycApproved: Boolean,
  accountType: String ("Basic" | "Premium"),
  timeDepositAmount: Number,
  agentWalletAmount: Number,
  usdtAmount: Number,
  availBalanceAmount: Number,
  dollarDepositAmount: Number,
  dollarAvailBalanceAmount: Number,
  cryptoAvailBalanceAmount: Number,
  dollarWalletAmount: Number,
  cryptoWalletAmount: Number,
  accumulatedPoints: Number,
  agent: Boolean,
  stock: Boolean,
  cryptoBalances: {
    BTC: Number,
    ETH: Number,
    USDT: Number
  },
  currencyBalances: {
    USD: Number,
    JPY: Number
  },
  createdAt: Date,
  updatedAt: Date,
  lastSignedIn: Date,
  userId: String (Firebase UID, optional),
  pendingReferral: Object (optional)
}
```

## JWT Token

### Token Payload

```javascript
{
  userId: String,        // MongoDB _id
  email: String,         // User email
  accountNumber: String, // User account number
  iat: Number,          // Issued at timestamp
  exp: Number           // Expiration timestamp
}
```

### Token Expiry

Default: 7 days (configurable via `JWT_EXPIRY` environment variable)

### Using the Token

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <your-token>" http://localhost:4000/api/auth/profile
```

## Error Codes

- `400` - Bad Request (invalid input, missing required fields)
- `401` - Unauthorized (invalid credentials or missing token)
- `404` - Not Found (user not found)
- `409` - Conflict (email already registered)
- `500` - Internal Server Error

## Environment Variables

Add to `.env` file:

```env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY=7d
```

## Testing

### Register a User

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "emailAddress": "john@example.com",
    "password": "password123",
    "confirmPassword": "password123"
  }'
```

### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "john@example.com",
    "password": "password123"
  }'
```

### Get Profile

```bash
curl -X GET http://localhost:4000/api/auth/profile \
  -H "Authorization: Bearer <your-token>"
```

## Integration with Frontend

### Registration Flow

1. Frontend collects user data
2. Frontend calls `POST /api/auth/register`
3. Backend creates user in MongoDB
4. Backend returns user data and JWT token
5. Frontend stores token and user data
6. Frontend uses token for authenticated requests

### Login Flow

1. Frontend collects email and password
2. Frontend calls `POST /api/auth/login`
3. Backend validates credentials
4. Backend returns user data and JWT token
5. Frontend stores token and user data
6. Frontend uses token for authenticated requests

## Security Features

- Passwords are hashed using bcrypt (10 salt rounds)
- JWT tokens for stateless authentication
- Token expiry for security
- Email uniqueness validation
- Password strength validation (minimum 6 characters)
- Email format validation

## Notes

- Passwords are never returned in API responses
- Account numbers are auto-generated (12 digits, starting with 0000)
- Users start with 10 accumulated points
- Default account type is "Basic"
- KYC approval defaults to false
- All financial balances initialize to 0


