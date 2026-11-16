/** Offline-safe font stacks; keys match the server's `theme.fontFamily` enum. */
export const THEME_FONTS = {
  sans: { label: "Sans serif", stack: "ui-sans-serif, system-ui, sans-serif" },
  serif: {
    label: "Serif",
    stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  mono: {
    label: "Monospace",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
};

/** Matches the look of an unthemed template, so "reset" and "add theme" start from it. */
export const DEFAULT_PAYSTUB_THEME = {
  primaryColor: "#092258",
  accentColor: "#1E60F2",
  tintColor: "#EBF2FA",
  backgroundColor: "#FFFFFF",
  headingColor: "#0F172A",
  textColor: "#475569",
  borderColor: "#E2E8F0",
  fontFamily: "sans",
  fontScale: 1,
  lineHeight: 1.25,
  letterSpacing: 0,
  pagePadding: 0,
  sectionSpacing: 8,
  borderRadius: 4,
};

// Unthemed values are the exact Tailwind classes the paystub used before theming.
const BASE_VARS = {
  "--ps-primary": "#092258",
  "--ps-accent": "#1E60F2",
  "--ps-tint": "#EBF2FA",
  "--ps-bg": "var(--color-white)",
  "--ps-s900": "var(--color-slate-900)",
  "--ps-s800": "var(--color-slate-800)",
  "--ps-s700": "var(--color-slate-700)",
  "--ps-s600": "var(--color-slate-600)",
  "--ps-s500": "var(--color-slate-500)",
  "--ps-s400": "var(--color-slate-400)",
  "--ps-b100": "var(--color-slate-100)",
  "--ps-b200": "var(--color-slate-200)",
  "--ps-b300": "var(--color-slate-300)",
  "--ps-surface": "color-mix(in oklab, var(--color-slate-50) 70%, transparent)",
  "--ps-fs": 1,
  "--ps-lh": "var(--leading-tight)",
  "--ps-gap": "0.5rem",
  "--ps-radius": "0.25rem",
};

const mix = (color, percent, base) =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

/** Inline style (CSS variables) for `PaystubThumbnail`'s root. */
export function themeStyle(theme, framed) {
  if (!theme) return BASE_VARS;
  const { textColor: text, borderColor: border, backgroundColor: bg } = theme;
  const pad = `${theme.pagePadding}px`;
  return {
    ...BASE_VARS,
    "--ps-primary": theme.primaryColor,
    "--ps-accent": theme.accentColor,
    "--ps-tint": theme.tintColor,
    "--ps-bg": bg,
    "--ps-s900": theme.headingColor,
    "--ps-s800": theme.headingColor,
    "--ps-s700": text,
    "--ps-s600": text,
    "--ps-s500": mix(text, 80, bg),
    "--ps-s400": mix(text, 55, bg),
    "--ps-b100": mix(border, 50, bg),
    "--ps-b200": border,
    "--ps-b300": border,
    "--ps-surface": mix(border, 25, bg),
    "--ps-fs": theme.fontScale,
    "--ps-lh": theme.lineHeight,
    "--ps-gap": `${theme.sectionSpacing}px`,
    "--ps-radius": `${theme.borderRadius}px`,
    fontFamily: THEME_FONTS[theme.fontFamily]?.stack,
    letterSpacing: `${theme.letterSpacing}em`,
    padding: framed ? `calc(0.75rem + ${pad})` : pad,
  };
}
