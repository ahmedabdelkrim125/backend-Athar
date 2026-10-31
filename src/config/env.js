const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

function normalizeEnvValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();

  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function firstDefinedEnv(keys) {
  for (const key of keys) {
    const normalizedValue = normalizeEnvValue(process.env[key]);

    if (normalizedValue) {
      return {
        key,
        value: normalizedValue,
      };
    }
  }

  return {
    key: '',
    value: '',
  };
}

function buildMysqlUrlFromParts() {
  const host = firstDefinedEnv(['MYSQLHOST', 'MYSQL_HOST']);
  const port = firstDefinedEnv(['MYSQLPORT', 'MYSQL_PORT']);
  const user = firstDefinedEnv(['MYSQLUSER', 'MYSQL_USER']);
  const password = firstDefinedEnv(['MYSQLPASSWORD', 'MYSQL_PASSWORD']);
  const database = firstDefinedEnv(['MYSQLDATABASE', 'MYSQL_DATABASE']);

  if (!host.value || !user.value || !database.value) {
    return {
      key: '',
      value: '',
    };
  }

  const credentials = `${encodeURIComponent(user.value)}:${encodeURIComponent(password.value)}`;
  const hostWithPort = `${host.value}:${port.value || '3306'}`;

  return {
    key: `${host.key}/${user.key}/${database.key}`,
    value: `mysql://${credentials}@${hostWithPort}/${encodeURIComponent(database.value)}`,
  };
}

function resolveDatabaseUrl() {
  const directUrl = firstDefinedEnv(['DATABASE_URL', 'MYSQL_URL', 'MYSQL_PUBLIC_URL']);

  if (directUrl.value) {
    return directUrl;
  }

  return buildMysqlUrlFromParts();
}

function normalizeOrigins(rawOrigins) {
  const normalizedOrigins = normalizeEnvValue(rawOrigins);

  if (!normalizedOrigins || normalizedOrigins === '*') {
    return ['*'];
  }

  return normalizedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const resolvedDatabaseUrl = resolveDatabaseUrl();

module.exports = {
  nodeEnv: normalizeEnvValue(process.env.NODE_ENV) || 'development',
  host: normalizeEnvValue(process.env.HOST) || '0.0.0.0',
  port: Number(normalizeEnvValue(process.env.PORT)) || 3000,
  corsOrigins: normalizeOrigins(process.env.CORS_ORIGINS),
  databaseUrl: resolvedDatabaseUrl.value,
  databaseUrlSource: resolvedDatabaseUrl.key,
  jwtSecret: normalizeEnvValue(process.env.JWT_SECRET) || 'change-this-secret',
  jwtAccessExpiresIn:
    normalizeEnvValue(process.env.JWT_ACCESS_EXPIRES_IN) ||
    normalizeEnvValue(process.env.JWT_EXPIRES_IN) ||
    '15m',
  jwtRefreshSecret:
    normalizeEnvValue(process.env.JWT_REFRESH_SECRET) ||
    normalizeEnvValue(process.env.JWT_SECRET) ||
    'change-this-secret',
  jwtRefreshExpiresIn: normalizeEnvValue(process.env.JWT_REFRESH_EXPIRES_IN) || '30d',
  rootDir,
};
