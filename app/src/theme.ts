export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "acheinator-theme";

/** Runs in <head> before the page paints, so a saved theme doesn't flash the other one first. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
