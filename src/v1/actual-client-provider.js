const { config } = require('../config/config');
const { createDirIfDoesNotExist } = require('../utils/utils');

let actualApi;
let actualApiInitPromise;
let actualApiShutdownPromise;
let actualApiInvalidationTimeout;

function getActualDataDir() {
  createDirIfDoesNotExist(config.actual.dataDir);
  return config.actual.dataDir;
}

async function initializeActualApiClient() {
  if (actualApiShutdownPromise) {
    await actualApiShutdownPromise;
  }

  const nextActualApi = require('@actual-app/api');
  await nextActualApi.init({
      dataDir: getActualDataDir(),
      serverURL: config.actual.serverUrl,
      password: config.actual.serverPassword,
  });
  actualApi = nextActualApi;
  scheduleActualApiInvalidation();
  console.log('Actual api client initialized successfully');
  return actualApi;
}

async function invalidateActualApiClient() {
  if (actualApiInitPromise) {
    try {
      await actualApiInitPromise;
    } catch (err) {
      return;
    }
  }

  if (!actualApiShutdownPromise) {
    actualApiShutdownPromise = shutdownActualApiClient()
      .finally(() => {
        actualApiShutdownPromise = null;
      });
  }
  return actualApiShutdownPromise;
}

async function shutdownActualApiClient() {
  clearActualApiInvalidation();
  const clientToShutdown = actualApi;
  actualApi = null;
  if (!clientToShutdown) return;

  await clientToShutdown.shutdown();
  console.log('Actual api client was shut down successfully');
}

function scheduleActualApiInvalidation() {
  clearActualApiInvalidation();
  actualApiInvalidationTimeout = setTimeout(invalidateActualApiClient, 1000 * 60 * 60);
}

function clearActualApiInvalidation() {
  if (actualApiInvalidationTimeout) {
    clearTimeout(actualApiInvalidationTimeout);
    actualApiInvalidationTimeout = null;
  }
}

exports.getActualDataDir = () => getActualDataDir();

exports.getActualApiClient = async () => {
  if (actualApi) {
    return actualApi;
  }

  if (!actualApiInitPromise) {
    actualApiInitPromise = initializeActualApiClient()
      .finally(() => {
        actualApiInitPromise = null;
      });
  }
  return actualApiInitPromise;
}
