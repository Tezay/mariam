export interface EventPalette {
  bg: string;
  card: string;
  accent: string;
  accentHover: string;
  text: string;
  textMuted: string;
  border: string;
  button: string;
  buttonText: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(...hexToRgb(hex1));
  const l2 = relativeLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text colours keep a 4.5:1 contrast with their background (WCAG AA). */
export function generateEventPalette(hex: string): EventPalette {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));

  const bg = hslToHex(h, Math.min(s, 30), 96);
  const card = hslToHex(h, Math.min(s, 35), 93);
  const border = hslToHex(h, Math.min(s, 40), 85);
  const accent = hslToHex(h, Math.max(s, 50), Math.min(Math.max(l, 35), 50));
  const accentHover = hslToHex(h, Math.max(s, 50), Math.min(Math.max(l, 25), 40));
  const button = accent;

  let text = hslToHex(h, Math.min(s, 30), 15);
  let textMuted = hslToHex(h, Math.min(s, 20), 40);

  if (contrastRatio(text, bg) < 4.5) {
    text = hslToHex(h, Math.min(s, 20), 10);
  }
  if (contrastRatio(textMuted, bg) < 3) {
    textMuted = hslToHex(h, Math.min(s, 15), 30);
  }

  const buttonText = contrastRatio(button, '#ffffff') >= 3 ? '#ffffff' : '#1a1a1a';

  return { bg, card, accent, accentHover, text, textMuted, border, button, buttonText };
}

export const EVENT_PRESET_COLORS = [
  { hex: '#E74C3C', label: 'Rouge' },
  { hex: '#E67E22', label: 'Orange' },
  { hex: '#F1C40F', label: 'Jaune' },
  { hex: '#2ECC71', label: 'Vert' },
  { hex: '#1ABC9C', label: 'Émeraude' },
  { hex: '#3498DB', label: 'Bleu' },
  { hex: '#9B59B6', label: 'Violet' },
  { hex: '#E91E63', label: 'Rose' },
  { hex: '#795548', label: 'Marron' },
  { hex: '#607D8B', label: 'Ardoise' },
];
