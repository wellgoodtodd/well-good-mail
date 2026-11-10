import { describe, expect, it } from 'vitest';
import { isMachineAddress } from '../machineAddress';

describe('isMachineAddress', () => {
  it('spots bounce, no-reply and tracking addresses', () => {
    for (const e of [
      '6522.1c.5dc45f7823a66740f854fbec.5dc452047b9e74024ff28b8f.toddwellfilms=gmail.com@event.a1e0.squarespace-mail.com',
      'bounce+8a2a89.55ddb-toddwellfilms=gmail.com@c.kajabimail.net',
      'bounce-1017967-1458-349233-toddwellfilms=gmail.com@s1.csa1.acemsc2.com',
      'bounce-144153-1096-68557-toddwellfilms=gmail.com@d8c.emsend1.com',
      'noreply@shop.com', 'no-reply@frame.io', 'do-not-reply@bank.co.uk', 'mailer-daemon@googlemail.com',
    ]) expect(isMachineAddress(e), e).toBe(true);
  });
  it('keeps people', () => {
    for (const e of ['todd@wellgood.media', 'toddwellfilms@gmail.com', 'jo.smith+work@example.com', 'bob.bounce@example.com', 'reply@studio.co.uk', 'a1b2c3@example.com'])
      expect(isMachineAddress(e), e).toBe(false);
  });
});
