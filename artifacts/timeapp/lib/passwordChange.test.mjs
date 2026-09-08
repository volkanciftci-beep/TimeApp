import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePasswordChange } from './passwordChange.ts';

test('accepts a valid password change', () => {
  assert.equal(
    validatePasswordChange(
      'Zeit-current-password!7',
      'Zeit-new-password-value!8',
      'Zeit-new-password-value!8',
    ),
    null,
  );
});

test('rejects missing, short, unchanged, and mismatched passwords', () => {
  assert.match(validatePasswordChange('', 'new', 'new'), /alle Passwortfelder/);
  assert.match(validatePasswordChange('old', 'too-short', 'too-short'), /15 Zeichen/);
  assert.match(
    validatePasswordChange('Zeit-same-password!7', 'Zeit-same-password!7', 'Zeit-same-password!7'),
    /unterscheiden/,
  );
  assert.match(
    validatePasswordChange('Zeit-old-password!7', 'Zeit-new-password!8', 'Zeit-other-password!9'),
    /stimmen nicht überein/,
  );
});