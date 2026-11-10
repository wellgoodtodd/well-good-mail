// Addresses that belong to a mailing system rather than a person: bounce handlers, no-reply senders and one-off
// tracking addresses such as bounce-1234-you=gmail.com@emsend1.com. They are never offered as suggestions.

const ROLE = /^(bounces?|mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply|notifications?-?noreply)([+._-]|$)/i;

export function isMachineAddress(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const local = email.slice(0, at);
  if (ROLE.test(local)) return true;
  // Someone's own address folded into the sender's (you=gmail.com@...) marks a bounce or tracking address.
  if (/[^=]=[a-z0-9-]+\.[a-z]{2,}/i.test(local)) return true;
  // A long run of letters and numbers like a code (6522.1c.5dc45f7823a66740...).
  if (/[0-9a-f]{16,}/i.test(local.replace(/[._-]/g, ''))) return true;
  return local.length > 48;
}
