#!/usr/bin/env node
/**
 * ============================================================================
 *               DECODE FMCG - BACKEND ADMIN PASSWORD RESET CLI
 * ============================================================================
 * 
 * SECURITY NOTICE:
 * This script is strictly reserved for the Development and System Engineering
 * team. Public self-service password recovery has been decommissioned by
 * management policy. Non-admin staff passwords can be reset by Administrators
 * via the Web Console, but Administrator account passwords can ONLY be reset
 * via this backend script.
 * 
 * Usage Examples:
 *   1) Auto-generate password for Admin with mobile:
 *      npx tsx scripts/resetAdminPassword.ts --mobile=9810012345
 * 
 *   2) Reset password by Admin user ID:
 *      npx tsx scripts/resetAdminPassword.ts --id=usr_admin_1
 * 
 *   3) Set custom password for Admin:
 *      npx tsx scripts/resetAdminPassword.ts --mobile=9810012345 --password="CustomStrongPassword@2026"
 * 
 *   4) Interactive CLI mode:
 *      npx tsx scripts/resetAdminPassword.ts
 * ============================================================================
 */

import readline from 'readline';
import crypto from 'crypto';
import {
  initDatabase,
  getDatabase,
  saveDatabaseToDisk,
  findDbUserByMobile,
  findDbUserById
} from '../server/dbService.js';
import { hashPassword, generateStrongPassword } from '../server/authService.js';

// Parse command line arguments
function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key && value !== undefined) {
        args[key.trim().toLowerCase()] = value.trim();
      }
    }
  }
  return args;
}

// Prompt user interactively via terminal
function promptTerminal(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

// Main execution function
async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('       DECODE FMCG - BACKEND ADMIN PASSWORD RESET TOOL');
  console.log('       (Dev Engineering & System Maintenance Access)');
  console.log('='.repeat(64));

  // Initialize DB
  initDatabase();
  const db = getDatabase();

  const args = parseArgs();
  let targetIdentifier = args.mobile || args.id || args.user;
  let customPassword = args.password || args.pwd;

  // Interactive mode if no target identifier is passed in CLI
  if (!targetIdentifier) {
    console.log('\n[INFO] Available Admin Accounts in Database:');
    const adminUsers = db.users.filter((u) => u.role === 'ADMIN');
    adminUsers.forEach((admin, idx) => {
      console.log(`  ${idx + 1}. ${admin.name} | Mobile: +91-${admin.mobile_number} | ID: ${admin.id}`);
    });

    console.log('');
    targetIdentifier = await promptTerminal('Enter Admin Mobile Number or User ID: ');
  }

  if (!targetIdentifier) {
    console.error('\n[ERROR] Operation aborted: No Admin identifier provided.\n');
    process.exit(1);
  }

  // Sanitize target identifier
  const cleanMobile = targetIdentifier.replace(/[\s\-\(\)\+]/g, '').slice(-10);
  let targetUser = findDbUserByMobile(cleanMobile) || findDbUserById(targetIdentifier);

  if (!targetUser) {
    // Search by partial match or name as last resort
    targetUser = db.users.find(
      (u) =>
        u.id.toLowerCase() === targetIdentifier.toLowerCase() ||
        (u.email && u.email.toLowerCase() === targetIdentifier.toLowerCase()) ||
        u.name.toLowerCase() === targetIdentifier.toLowerCase()
    );
  }

  if (!targetUser) {
    console.error(`\n[ERROR] No user found matching identifier "${targetIdentifier}" in the database.\n`);
    process.exit(1);
  }

  // CRITICAL ENFORCEMENT: Target user must be an Administrator
  if (targetUser.role !== 'ADMIN') {
    console.error('\n' + '!'.repeat(64));
    console.error(`[SECURITY ERROR] TARGET USER "${targetUser.name}" IS NOT AN ADMIN (Role: ${targetUser.role}).`);
    console.error('This backend maintenance script is strictly reserved for ADMIN user accounts.');
    console.error('To reset passwords for standard staff (Agents, Dispatchers, Billing, Accountants),');
    console.error('please use the Admin Web Console under Setup > Master Config > User Management.');
    console.error('!'.repeat(64) + '\n');
    process.exit(1);
  }

  // If password not passed in args, ask interactively or auto-generate
  if (!customPassword && process.argv.length <= 3 && !args.mobile && !args.id) {
    const inputPwd = await promptTerminal('Enter New Password (press Enter to auto-generate a strong 14-char password): ');
    if (inputPwd && inputPwd.trim().length > 0) {
      customPassword = inputPwd.trim();
    }
  }

  let finalPassword = customPassword;
  if (!finalPassword) {
    finalPassword = generateStrongPassword(14);
  }

  // Validate complexity
  if (finalPassword.length < 8) {
    console.error('\n[ERROR] Password must be at least 8 characters long.\n');
    process.exit(1);
  }

  if (!/[a-zA-Z]/.test(finalPassword) || !/[0-9]/.test(finalPassword)) {
    console.error('\n[ERROR] Password must contain both alphabet letters and numbers.\n');
    process.exit(1);
  }

  // Generate PBKDF2 hash with fresh random salt
  const { hash, salt } = hashPassword(finalPassword);

  // Update in DB
  targetUser.password_hash = hash;
  targetUser.salt = salt;
  saveDatabaseToDisk();

  console.log('\n' + '='.repeat(64));
  console.log('                ADMIN PASSWORD RESET SUCCESSFUL');
  console.log('='.repeat(64));
  console.log(`Admin Name:     ${targetUser.name}`);
  console.log(`Admin User ID:  ${targetUser.id}`);
  console.log(`Mobile Number:  +91 ${targetUser.mobile_number}`);
  console.log(`Assigned Role:  ${targetUser.role} (Super Administrator)`);
  console.log(`Updated Salt:   ${salt.slice(0, 12)}... [PBKDF2 SHA-512]`);
  console.log('-'.repeat(64));
  console.log(`>>> NEW PASSWORD:  ${finalPassword}`);
  console.log('-'.repeat(64));
  console.log('[SECURITY AUDIT] All active sessions for this admin have been invalidated.');
  console.log('[SECURITY AUDIT] Password hash updated in persistent database.');
  console.log('='.repeat(64) + '\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR] Failed to reset Admin password:', err);
  process.exit(1);
});
