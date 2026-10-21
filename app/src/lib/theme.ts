// Prasad Shoes theme – colours taken from the shop logo (Kolhapuri brown on cream).
// Every screen reads its colours from here: change a colour once, it changes everywhere.
export const C = {
  ground: '#FAF5EC', // page background (light cream)
  card: '#FFFDF9', // cards, inputs, tab bar (warm white)
  action: '#7A3214', // buttons, links, active tab (logo brown)
  actionPressed: '#5E260F',
  onAction: '#FFFFFF', // text / icons on a brown button
  onActionSub: '#F3E4D3', // smaller text on a brown button
  tint: '#F3E4D3', // light brown highlight (selected rows, chips)
  tintBorder: '#E2C9AE',
  pressed: '#F1E8DB', // row being tapped
  rowAlt: '#FBF7F1', // every other table row
  text: '#2B1A12',
  muted: '#7A6A5E',
  tabInactive: '#6B5A4E',
  border: '#EADFD0',
  inputBorder: '#DCCBB6',
  checkBorder: '#A8998B', // checkbox outline, dashed boxes
  track: '#DCCBB6', // switch "off" track
  backdrop: 'rgba(43,26,18,0.55)', // behind pop-up sheets
  highlight: '#D97706', // input that needs a look
  highlightTint: '#FFFBEB',
  danger: '#DC2626',
  dangerTint: '#FEE2E2',
  dangerBorder: '#F3A3A3',
  warn: '#92400E',
  warnTint: '#FEF3C7',
  warnBorder: '#F5C27A',
  ok: '#166534',
  okTint: '#DCFCE7',
  placeholder: '#A8998B',
};

export const R = { card: 14, input: 10, button: 12, pill: 999 };

/** Content stays readable on the website: phone-width column, wider for tables. */
export const MAX_W = 720;
export const MAX_W_WIDE = 1100;
