require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { normalizeEmail, validatePassword } = require('../validators/admin-auth.validators');

function prompt(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => terminal.question(question, (answer) => {
    terminal.close();
    resolve(answer.trim());
  }));
}

function promptHidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Admin bootstrap requires an interactive terminal for password entry.');
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let value = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (key) => {
      if (key === '\u0003') return finish(new Error('Admin bootstrap cancelled.'));
      if (key === '\r' || key === '\n') return finish();
      if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
        return;
      }
      if (key >= ' ' && key !== '\u007f') value += key;
    };
    input.on('data', onData);
  });
}

async function run() {
  const email = normalizeEmail(await prompt('Admin email: '));
  const fullName = await prompt('Admin full name: ');
  const password = validatePassword(await promptHidden('Admin password (12+ characters): '));
  const confirmation = await promptHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('The passwords do not match.');

  await prisma.$transaction(async (transactionClient) => {
    const lock = await transactionClient.$queryRaw`SELECT GET_LOCK('athar_admin_bootstrap', 10) AS acquired`;
    if (Number(lock[0]?.acquired) !== 1) throw new Error('Could not acquire the admin bootstrap lock.');
    try {
      if (await transactionClient.admin.count() !== 0) {
        throw new Error('An admin already exists. Use the protected Admin API to add more accounts.');
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await transactionClient.admin.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: 'ADMIN',
          isActive: true,
          mustChangePassword: false,
        },
      });
      await transactionClient.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'ADMIN_BOOTSTRAPPED',
          targetType: 'ADMIN',
          targetId: String(admin.id),
        },
      });
      process.stdout.write(`Created the initial ADMIN account (id ${admin.id}).\n`);
    } finally {
      await transactionClient.$queryRaw`SELECT RELEASE_LOCK('athar_admin_bootstrap')`;
    }
  });
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
