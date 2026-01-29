/**
 * Models Index - Central export for all models
 * Provides both singleton instances and classes for dependency injection
 */

const BaseModel = require('./BaseModel');
const User = require('./User');
const Agent = require('./Agent');
const RefreshToken = require('./RefreshToken');
const ApiKey = require('./ApiKey');
const {
    AgentType,
    MasterAgent,
    Agent: AgentClass,
    ConsultantAgent,
    AgentTypeFactory
} = require('./AgentType');

module.exports = {
    // Base class
    BaseModel,

    // Model instances (for backward compatibility)
    User,
    Agent,
    RefreshToken,
    ApiKey,

    // Model classes (for testing and dependency injection)
    UserClass: User.User,
    AgentModelClass: Agent.AgentModel,
    RefreshTokenClass: RefreshToken.RefreshToken,
    ApiKeyClass: ApiKey.ApiKey,

    // Agent type classes (for polymorphism)
    AgentType,
    MasterAgent,
    AgentClass,
    ConsultantAgent,
    AgentTypeFactory
};
