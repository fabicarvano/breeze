import { describe, expect, it } from 'vitest';
import { helperBrandingSchema, readHelperBranding, helperBrandingForeground } from './helperBranding';
describe('Helper branding closed input', () => {
  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(helperBrandingSchema.safeParse({ displayName: '😀'.repeat(60) }).success).toBe(true);
    expect(helperBrandingSchema.safeParse({ displayName: '😀'.repeat(61) }).success).toBe(false);
  });
  it.each(['\n', '\r', '\t', '\u0000', '\u202e', '\u2028'])('rejects controls %s', c => {
    expect(helperBrandingSchema.safeParse({ welcomeMessage: `hello${c}world` }).success).toBe(false);
  });
  it.each(['red', '#fff', '#ffffffff', 'rgb(0,0,0)', 'url(x)', '#FFFFFF\n', '#FFFFFF\r\n'])('rejects unsafe colors %s', primaryColor => {
    expect(helperBrandingSchema.safeParse({ primaryColor }).success).toBe(false);
  });
  it('strips arbitrary fields, keeps text literal, and treats blank as inherited', () => {
    expect(helperBrandingSchema.parse({ displayName: '<b>Example</b>', companyName: ' ', customCss: 'x', logoUrl: 'x' }))
      .toEqual({ displayName: '<b>Example</b>', companyName: undefined });
  });
  it('drops an invalid stored field without losing valid siblings', () => {
    expect(readHelperBranding({ displayName: 'Assist', welcomeTitle: 'x\n', primaryColor: 'red' })).toEqual({ displayName: 'Assist' });
  });
  it('chooses contrasting foregrounds at both luminance extremes', () => {
    expect(helperBrandingForeground('#FFFFFF')).toBe('#000000');
    expect(helperBrandingForeground('#000000')).toBe('#FFFFFF');
  });
});
