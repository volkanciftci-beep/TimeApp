export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
) {
  if (!currentPassword || !newPassword || !confirmation) {
    return 'Bitte füllen Sie alle Passwortfelder aus.';
  }
  if (newPassword.length < 15) {
    return 'Das neue Passwort muss mindestens 15 Zeichen lang sein.';
  }
  if (newPassword === currentPassword) {
    return 'Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.';
  }
  if (newPassword !== confirmation) {
    return 'Die neuen Passwörter stimmen nicht überein.';
  }
  return null;
}