// tenantContext.js — AsyncLocalStorage para contexto de tenant por request
const { AsyncLocalStorage } = require('node:async_hooks');

const tenantStorage = new AsyncLocalStorage();

module.exports = {
  tenantStorage,
  getTenantContext: () => tenantStorage.getStore(),
};
