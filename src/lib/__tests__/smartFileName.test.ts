import { describe, expect, it } from 'vitest';
import { invoiceAmount, nameFacts, renamedFile } from '../sendTo';

const name = (m: Parameters<typeof nameFacts>[0], text: string, original: string, _date: string) => renamedFile({ on: true, how: 'custom', text: '', pattern: 'YYMMDD_{sender} {amount}' }, nameFacts(m, text, original));

describe('naming saved invoices by date, who and amount', () => {
  it('finds the amount paid, not a subtotal or tax line', () => {
    expect(invoiceAmount('Subtotal £15.00\nVAT £3.00\nTotal £18.00')).toBe('18.00');
    expect(invoiceAmount('Amount paid $1,250.00\nTotal due $0.00')).toBe('1250.00');
    expect(invoiceAmount('Thanks! You were charged €13.10 for Pro.')).toBe('13.10');
    expect(invoiceAmount('Your plan renews soon for 20.00 GBP.')).toBe('20.00');
    expect(invoiceAmount('Your order of 3 items has shipped')).toBe('');
  });

  it('names the file from the date, the sender and the amount', () => {
    const date = new Date(2026, 10, 13).getTime();
    expect(name({ from: { name: 'Frame.io', email: 'billing@frame.io' }, subject: 'Your receipt', date }, 'Amount paid: £18.00', 'Invoice-48213.pdf', 'YYMMDD_')).toBe('261113_Frame.io 18.00.pdf');
    expect(name({ from: { name: 'Anthropic, PBC', email: 'invoice+statements@mail.anthropic.com' }, subject: 'Your receipt from Anthropic', date }, 'Total $13.10', 'Receipt-2231.pdf', 'YYMMDD_')).toBe('261113_Anthropic 13.10.pdf');
    expect(name({ from: { email: 'no-reply@canva.com', name: 'Canva billing' }, subject: 'Invoice', date }, 'Thanks', 'inv.pdf', 'YYMMDD_')).toBe('261113_Canva.pdf');
  });
});
