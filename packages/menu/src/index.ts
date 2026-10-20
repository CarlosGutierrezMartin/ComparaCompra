export const MENU_MODES = ["ahorro", "variedad", "aprovechamiento"] as const;
export type MenuMode = (typeof MENU_MODES)[number];
