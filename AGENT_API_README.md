# Agent Hierarchy API Documentation

## Overview

This API manages agent hierarchies and commission structures for the Inspire Wallet system. It handles agent code generation, hierarchy management, and commission distribution calculations.

## Base URL

```
http://localhost:4000/api/agents
```

## Authentication

All endpoints require an API key in the `X-API-Key` header.

### Generating an API Key

Run the script to generate a new API key:

```bash
node scripts/generateApiKey.js "Description of the key"
```

The script will output:
- The API key (save this securely - it cannot be retrieved later)
- The hashed key stored in the database

## API Endpoints

### 1. Generate Agent Code

Generate a hierarchical agent code for a new agent registration.

**Endpoint:** `POST /api/agents/generate-code`

**Headers:**
```
X-API-Key: <your-api-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "referrerCode": "ABC12-00000-00000",
  "agentNumber": "XYZ34"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "agentCode": "ABC12-XYZ34-00000",
    "agentNumber": "XYZ34",
    "type": "Agent",
    "commissionNumbers": {
      "currentAgent": "XYZ34",
      "masterAgent": "ABC12"
    },
    "referrer": {
      "userId": "user123",
      "name": "John Doe",
      "agentCode": "ABC12-00000-00000",
      "type": "Master Agent"
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

### 2. Get Agent by Code

Retrieve agent information by agent code.

**Endpoint:** `GET /api/agents/:agentCode`

**Example:**
```bash
GET /api/agents/ABC12-XYZ34-00000
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "agentNumber": "XYZ34",
    "agentCode": "ABC12-XYZ34-00000",
    "userId": "user123",
    "firstName": "Jane",
    "lastName": "Smith",
    "fullName": "Jane Smith",
    "type": "Agent",
    "referrerCode": "ABC12-00000-00000",
    "commissionNumbers": {
      "currentAgent": "XYZ34",
      "masterAgent": "ABC12"
    },
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get Agent Hierarchy

Get agent hierarchy with commission distribution.

**Endpoint:** `GET /api/agents/:agentCode/hierarchy`

**Example:**
```bash
GET /api/agents/ABC12-XYZ34-DEF56/hierarchy
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentAgent": {
      "userId": "user456",
      "name": "Bob Johnson",
      "agentCode": "ABC12-XYZ34-DEF56",
      "agentNumber": "DEF56",
      "type": "Consultant Agent",
      "commission": 70,
      "recruits": []
    },
    "agent": {
      "userId": "user123",
      "name": "Jane Smith",
      "agentCode": "ABC12-XYZ34-00000",
      "agentNumber": "XYZ34",
      "type": "Agent",
      "commission": 20,
      "recruits": [...]
    },
    "masterAgent": {
      "userId": "user789",
      "name": "John Doe",
      "agentCode": "ABC12-00000-00000",
      "agentNumber": "ABC12",
      "type": "Master Agent",
      "commission": 10,
      "recruits": [...]
    },
    "commissionDistribution": [
      {
        "userId": "user456",
        "name": "Bob Johnson",
        "agentCode": "ABC12-XYZ34-DEF56",
        "agentNumber": "DEF56",
        "type": "Consultant Agent",
        "commission": 70
      },
      {
        "userId": "user123",
        "name": "Jane Smith",
        "agentCode": "ABC12-XYZ34-00000",
        "agentNumber": "XYZ34",
        "type": "Agent",
        "commission": 20
      },
      {
        "userId": "user789",
        "name": "John Doe",
        "agentCode": "ABC12-00000-00000",
        "agentNumber": "ABC12",
        "type": "Master Agent",
        "commission": 10
      }
    ],
    "commissionNumbers": {
      "currentAgent": "DEF56",
      "agent": "XYZ34",
      "masterAgent": "ABC12"
    }
  }
}
```

### 4. Get All Agents

Retrieve all active agents.

**Endpoint:** `GET /api/agents`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "agentNumber": "ABC12",
      "agentCode": "ABC12-00000-00000",
      "type": "Master Agent",
      ...
    },
    ...
  ]
}
```

## Agent Code Format

Agent codes follow the format: `XXXXX-XXXXX-XXXXX` (three parts, each exactly 5 alphanumeric characters)

- **Master Agent**: `ABC12-00000-00000` (first part is agent number, rest are zeros)
- **Agent**: `ABC12-XYZ34-00000` (first is master, second is agent, third is zero)
- **Consultant Agent**: `ABC12-XYZ34-DEF56` (all three parts filled)

## Commission Structure

- **Master Agent**: 100% commission when finding investor directly
- **Agent**: 70% commission, Master Agent gets 30%
- **Consultant Agent**: 70% commission, Agent gets 20%, Master Agent gets 10%

## Code Generation Logic

1. **Master Agent** (referrerCode = "00000-00000" or no referrer):
   - Format: `{agentNumber}-00000-00000`
   - Type: "Master Agent"

2. **Agent** (referrer is Master Agent):
   - Format: Replace first `00000` in referrer's code with new agentNumber
   - Example: Referrer `ABC12-00000-00000` + Agent `XYZ34` = `ABC12-XYZ34-00000`
   - Type: "Agent"

3. **Consultant Agent** (referrer is Agent):
   - Format: Replace second `00000` in referrer's code
   - Example: Referrer `ABC12-XYZ34-00000` + Agent `DEF56` = `ABC12-XYZ34-DEF56`
   - Type: "Consultant Agent"

4. **Special Case** (referrer is Consultant Agent):
   - Uses agent number from referrer's commissionNumbers.agent
   - Format: `{masterAgentNumber}-{agentNumber}-{newAgentNumber}`
   - Type: "Consultant Agent"

## Error Codes

- `400` - Bad Request (invalid input, missing required fields)
- `401` - Unauthorized (invalid or missing API key)
- `404` - Not Found (agent not found)
- `500` - Internal Server Error

## Testing

### Using cURL

```bash
# Generate agent code
curl -X POST http://localhost:4000/api/agents/generate-code \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "referrerCode": "ABC12-00000-00000",
    "agentNumber": "XYZ34"
  }'

# Get agent by code
curl -X GET http://localhost:4000/api/agents/ABC12-XYZ34-00000 \
  -H "X-API-Key: your-api-key-here"

# Get agent hierarchy
curl -X GET http://localhost:4000/api/agents/ABC12-XYZ34-DEF56/hierarchy \
  -H "X-API-Key: your-api-key-here"
```

## Database Collections

### `agents`
Stores agent information, hierarchy relationships, and commission data.

### `apiKeys`
Stores API keys for authentication (hashed and encrypted).

## Notes

- Agent codes must be unique
- Agent numbers must be exactly 5 alphanumeric characters
- All agent codes are validated before storage
- Commission distribution is calculated automatically based on agent type


