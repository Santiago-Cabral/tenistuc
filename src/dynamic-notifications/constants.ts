// Constantes de tuning del overlay de notificaciones dinámicas.
// Valores ports desde expo-dynamic-notifications: no cambiar sin probarlo en
// un device real (afectan el tamaño de la gota, el cuello y los tiempos).

// ── Isla (la "pastilla" de la que cae la gota) ───────────────────────────────
export const ISLAND_WIDTH = 126;
export const ISLAND_HEIGHT = 37.33;
export const ISLAND_TOP = 11;
export const ISLAND_MIN_TOP = 12;

// ── Tarjeta de contenido ─────────────────────────────────────────────────────
export const CARD_MAX_WIDTH = 396;
export const CARD_HEIGHT = 74;
export const CARD_MARGIN = 16;
export const CARD_GAP = 34;

// ── Gota y cuello ────────────────────────────────────────────────────────────
export const DROP_SIZE = 52;
export const NECK_WIDTH = 60;
export const CANVAS_PADDING = 96;
export const EDGE_MARGIN = 10;

// ── Efecto gooey (Skia: Blur + ColorMatrix) ──────────────────────────────────
export const GOO_STRENGTH = 0.62;
export const GOO_BLUR_MIN = 5;
export const GOO_BLUR_MAX = 20;
export const GOO_GAIN = 22;
export const GOO_THRESHOLD = 0.43;
export const GOO_INSET_RATIO = 0.26;

// ── Forma de la gota ─────────────────────────────────────────────────────────
export const DROP_GROW_SPAN = 0.7;
export const DROP_GROW_POWER = 1.25;
export const DROP_STRETCH = 0.38;
export const EXIT_ANTICIPATION_VELOCITY = 2;
export const NECK_BREAK = 0.82;
export const NECK_RISE = 1.6;
export const NECK_FALL = 1.4;

// ── Color ────────────────────────────────────────────────────────────────────
export const DROP_TINT_START = 0.06;
export const DROP_TINT_END = 0.88;

// ── Contenido ────────────────────────────────────────────────────────────────
export const CONTENT_MIN_SCALE = 0.88;
export const BLUR_INTENSITY = 64;
export const SHADOW_DY = 10;
export const SHADOW_BLUR = 14;

// ── Tiempos (ms) ─────────────────────────────────────────────────────────────
export const ENTER_TINT_DELAY = 110;
export const ENTER_EXPAND_DELAY = 340;
export const ENTER_REVEAL_DELAY = 560;
export const EXIT_COLLAPSE_DELAY = 100;
export const EXIT_DROP_DELAY = 280;
export const AUTO_DISMISS = 5000;

// ── Gesto de descarte ────────────────────────────────────────────────────────
export const SWIPE_DISTANCE = -18;
export const SWIPE_VELOCITY = -420;
