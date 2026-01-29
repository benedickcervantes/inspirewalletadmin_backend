# Template Guide

This is a minimal template for building a layered/modular Express.js backend. Add features step by step following this guide.

## 📁 Directory Structure

```
backend/
├── config/          # Configuration files (database, email, app settings)
├── controllers/     # Request/response handlers
├── middleware/      # Express middleware (auth, validation, error handling)
├── models/          # Data models and database abstractions
├── routes/          # API route definitions
├── services/        # Business logic layer
├── utils/           # Utility functions
├── server.js        # Application entry point
├── package.json     # Dependencies
└── README.md        # Documentation
```

## 🎯 Adding a New Feature - Step by Step

### Example: Adding a "Users" Feature

#### Step 1: Create Model (`models/User.js`)

```javascript
class User {
  static async findById(id) {
    // Database operations here
  }
  
  static async create(data) {
    // Create user logic
  }
}

module.exports = User;
```

#### Step 2: Create Service (`services/userService.js`)

```javascript
const User = require('../models/User');

class UserService {
  static async getUserById(id) {
    // Business logic here
    const user = await User.findById(id);
    return user;
  }
}

module.exports = UserService;
```

#### Step 3: Create Controller (`controllers/userController.js`)

```javascript
const UserService = require('../services/userService');

class UserController {
  static getUser = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await UserService.getUserById(id);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = UserController;
```

#### Step 4: Create Routes (`routes/userRoutes.js`)

```javascript
const express = require('express');
const UserController = require('../controllers/userController');

const router = express.Router();

router.get('/users/:id', UserController.getUser);

module.exports = router;
```

#### Step 5: Register Routes (`routes/index.js`)

```javascript
const userRoutes = require('./userRoutes');
router.use(userRoutes);
```

## 🔧 Common Additions

### Adding Middleware

Create file in `middleware/`:

```javascript
// middleware/auth.js
const auth = (req, res, next) => {
  // Authentication logic
  next();
};

module.exports = auth;
```

Use in routes:
```javascript
const auth = require('../middleware/auth');
router.get('/protected', auth, controller.method);
```

### Adding Configuration

Create file in `config/`:

```javascript
// config/database.js
module.exports = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT
};
```

### Adding Utilities

Create file in `utils/`:

```javascript
// utils/logger.js
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

module.exports = logger;
```

## 📦 Adding Dependencies

When you need new packages:

```bash
npm install package-name
```

Then use in your code:
```javascript
const packageName = require('package-name');
```

## 🎨 Best Practices

1. **Keep controllers thin** - Only handle HTTP concerns
2. **Put business logic in services** - Reusable across controllers
3. **Models handle data** - Database operations only
4. **Use async/await** - For asynchronous operations
5. **Handle errors** - Use try/catch or error middleware
6. **Validate input** - Check request data before processing

## 🚀 Next Steps

1. Start with a simple feature (e.g., health check - already included)
2. Add authentication middleware
3. Add error handling middleware
4. Add your first feature following the steps above
5. Expand gradually

## 📚 Resources

- Express.js Docs: https://expressjs.com/
- Node.js Docs: https://nodejs.org/docs/

