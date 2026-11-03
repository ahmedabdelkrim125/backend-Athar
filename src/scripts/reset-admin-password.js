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
    throw new Error('Admin password recovery requires an interactive terminal.');
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
      if (key === '\u0003') return finish(new Error('Admin password recovery cancelled.'));
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
  const newPassword = validatePassword(await promptHidden('New password (12+ characters): '));
  const confirmation = await promptHidden('Confirm new password: ');
  if (newPassword !== confirmation) throw new Error('The passwords do not match.');

  await prisma.$transaction(async (transactionClient) => {
    const admin = await transactionClient.admin.findUnique({ where: { email } });
    if (!admin) throw new Error('No admin account matches that email.');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await transactionClient.admin.update({
      where: { id: admin.id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    });
    await transactionClient.adminAuthSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transactionClient.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_PASSWORD_RECOVERED',
        targetType: 'ADMIN',
        targetId: String(admin.id),
      },
    });
  });
  process.stdout.write('Password reset. The account must change it after its next login.\n');
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
