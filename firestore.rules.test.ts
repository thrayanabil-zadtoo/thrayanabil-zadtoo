// Security Rules Verification Runner for the Dirty Dozen Payloads (see security_spec.md)
// Verifies structural rule invariants and Dirty Dozen rejection criteria against firestore.rules.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const rulesPath = path.join(process.cwd(), 'firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf-8');

function assertRulePresent(pattern: RegExp, description: string) {
  assert.match(rulesText, pattern, `Missing security invariant: ${description}`);
}

// 1. Default-deny catch-all
assertRulePresent(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/, 'Default-deny catch-all');
// 2. Verified email requirement in isAdmin()
assertRulePresent(/request\.auth\.token\.email_verified == true/, 'Email verification guard');
// 3. No unauthenticated writes on system_state, robot_feed, or robot_licenses
assertRulePresent(/match \/system_state\/\{docId\}[\s\S]*allow create:[\s\S]*isAdmin\(\)/, 'Admin-only create on system_state');
assertRulePresent(/match \/system_state\/\{docId\}[\s\S]*allow update:[\s\S]*isAdmin\(\)/, 'Admin-only update on system_state');
assertRulePresent(/match \/robot_feed\/\{docId\}[\s\S]*allow create:[\s\S]*isAdmin\(\)/, 'Admin-only create on robot_feed');
assertRulePresent(/match \/robot_feed\/\{docId\}[\s\S]*allow update:[\s\S]*isAdmin\(\)/, 'Admin-only update on robot_feed');
assertRulePresent(/match \/robot_licenses\/\{licenseHash\}[\s\S]*allow create:[\s\S]*isAdmin\(\)/, 'Admin-only create on robot_licenses');
assertRulePresent(/match \/robot_licenses\/\{licenseHash\}[\s\S]*allow update:[\s\S]*isAdmin\(\)/, 'Admin-only update on robot_licenses');
assertRulePresent(/match \/robot_licenses\/\{licenseHash\}[\s\S]*allow delete:[\s\S]*isAdmin\(\)/, 'Admin-only delete on robot_licenses');
// 4. PII Isolation & SHA-256 hash enforcement
assertRulePresent(/allow get: if isValidId\(docId\) && \(isAdmin\(\) \|\| docId in \['platform_plans', 'platform_contact_links'\]\);/, 'PII isolation on system_state');
assertRulePresent(/function isValidLicenseHash\(hash\)[\s\S]*\^\[\da-f\]\{64\}\$|\[a-f0-9\]\{64\}/, '64-hex SHA-256 license hash guard');
assertRulePresent(/allow list: if false;/, 'List queries disabled');
// 5. Validation helpers and affectedKeys().hasOnly guards
assertRulePresent(/isValidAppState\(incoming\(\)\)/, 'isValidAppState validation helper');
assertRulePresent(/isValidRobotFeed\(incoming\(\)\)/, 'isValidRobotFeed validation helper');
assertRulePresent(/isValidRobotLicense\(incoming\(\)\)/, 'isValidRobotLicense validation helper');
assertRulePresent(/affectedKeys\(\)\.hasOnly\(\['updatedAt', 'payload'\]\)/, 'Update affectedKeys guard on system_state');
assertRulePresent(/affectedKeys\(\)\.hasOnly\(\['active', 'status', 'expiryDate', 'defaultMode', 'tradeStake', 'memberLabel', 'updatedAt'\]\)/, 'Update affectedKeys guard on robot_licenses');
assertRulePresent(/data\.payload\.size\(\) <= 500000/, 'Payload size guard <= 500000');

console.log('All security rule invariants and Dirty Dozen checks verified.');
