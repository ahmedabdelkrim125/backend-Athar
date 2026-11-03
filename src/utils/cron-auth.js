const { timingSafeEqual } = require('crypto');

function isValidCronAuthorization(authorizationHeader) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || typeof authorizationHeader !== 'string') return false;
  const prefix = 'Bearer ';
  if (!authorizationHeader.startsWith(prefix)) return false;
  const supplied = Buffer.from(authorizationHeader.slice(prefix.length));
  const expected = Buffer.from(expectedSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

module.exports = { isValidCronAuthorization };
