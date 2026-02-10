# Inspire Wallet Backend API

A RESTful API backend built with Express.js using a layered/modular architecture.

## 🏗️ Architecture

This backend follows a **Layered/Modular Architecture** pattern:

```
backend/
├── config/          # Configuration files
├── controllers/     # Request/response handlers
├── middleware/      # Express middleware
├── models/          # Data models
├── routes/          # API route definitions
├── services/        # Business logic layer
├── utils/           # Utility functions
└── server.js        # Application entry point
```

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file:

```env
PORT=4000
NODE_ENV=development
```

### Start Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server runs on `http://localhost:4000`

## 📁 Project Structure

- **Routes** (`routes/`) - Define API endpoints
- **Controllers** (`controllers/`) - Handle HTTP requests/responses
- **Services** (`services/`) - Business logic
- **Models** (`models/`) - Data access layer
- **Middleware** (`middleware/`) - Cross-cutting concerns
- **Config** (`config/`) - Configuration files
- **Utils** (`utils/`) - Helper functions

## 📝 Adding Features

Follow the layered architecture:

1. Create **Model** (if needed) - `models/YourModel.js`
2. Create **Service** - `services/yourService.js`
3. Create **Controller** - `controllers/yourController.js`
4. Create **Routes** - `routes/yourRoutes.js`
5. Register routes in `routes/index.js`

## 📄 License

**Proprietary - Internal Use Only**

Copyright © Inspire Holdings Incorporated. All rights reserved.

