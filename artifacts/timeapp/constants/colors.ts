/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#17212B',
    tint: '#1F7A5A',

    // Core surfaces
    background: '#F5F7F8',
    foreground: '#17212B',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#17212B',

    // Primary action color (buttons, links, active states)
    primary: '#1F7A5A',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E9EFF0',
    secondaryForeground: '#24323D',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E9EFF0',
    mutedForeground: '#6C7A84',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#D9EEE5',
    accentForeground: '#16583F',

    // Destructive actions (delete, error states)
    destructive: '#C94A4A',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#D9E1E4',
    input: '#D9E1E4',

    // TimeApp brand tokens
    brandDeep: '#102C3A',
    brandMid: '#174C58',
    success: '#1F7A5A',
    successSoft: '#E5F2EC',
    danger: '#C94A4A',
    dangerSoft: '#F9E9E8',
    surface: '#FFFFFF',
    surfaceAlt: '#EFF3F3',
    white: '#FFFFFF',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
