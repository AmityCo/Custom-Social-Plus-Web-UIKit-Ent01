import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { lighten, parseToHsl, darken, hslToColorString } from 'polished';
import { Config, defaultConfig, GetConfigReturnValue } from './CustomizationProvider';
import { type AmityFontConfig, resolveFontVariables } from '~/v4/core/fonts';

const SHADE_PERCENTAGES = [0.25, 0.4, 0.5, 0.75];

export const generateShades = (hexColor?: string, isDarkMode = false): string[] => {
  if (!hexColor) return Array(SHADE_PERCENTAGES.length).fill('');

  if (isDarkMode === true && hexColor === defaultConfig.theme.dark.primary_color) {
    return ['#4a82f2', '#a9c4f9', '#d9e5fc', '#ffffff'];
  }

  if (isDarkMode === false && hexColor === defaultConfig.theme.light.primary_color) {
    return ['#4a82f2', '#a9c4f9', '#d9e5fc', '#ffffff'];
  }

  const hslColor = parseToHsl(hexColor);

  const shades = SHADE_PERCENTAGES.map((percentage) => {
    if (isDarkMode) {
      return darken(percentage, hslToColorString(hslColor));
    } else {
      return lighten(percentage, hslToColorString(hslColor));
    }
  });

  return shades;
};

export function useGenerateStylesShadeColors(config: GetConfigReturnValue) {
  const { currentTheme, forcedTheme } = useTheme();

  const preferredTheme = useMemo(() => {
    if (config?.preferred_theme && config?.preferred_theme !== 'default') {
      return config.preferred_theme;
    }

    return 'default';
  }, [config?.preferred_theme, currentTheme]);

  // A forced theme (e.g. the story viewer which is always light) must win over both the
  const computedTheme =
    forcedTheme ?? (preferredTheme === 'default' ? currentTheme : preferredTheme);

  const generatedColors = useMemo(() => {
    const themeConfig = config?.theme?.[computedTheme] || {};

    const primary = generateShades(themeConfig.primary_color);

    return {
      '--asc-color-primary-default': themeConfig.primary_color,
      '--asc-color-primary-shade1': primary[0],
      '--asc-color-primary-shade2': primary[1],
      '--asc-color-primary-shade3': primary[2],
      '--asc-color-primary-shade4': primary[3],

      '--asc-color-secondary-default': themeConfig.secondary_color,
      '--asc-color-secondary-shade1': themeConfig.secondary_shade1_color,
      '--asc-color-secondary-shade2': themeConfig.secondary_shade2_color,
      '--asc-color-secondary-shade3': themeConfig.secondary_shade3_color,
      '--asc-color-secondary-shade4': themeConfig.secondary_shade4_color,

      '--asc-color-alert-default': themeConfig.alert_color,

      '--asc-color-base-inverse': themeConfig.base_inverse_color,

      '--asc-color-base-default': themeConfig.base_color,
      '--asc-color-base-shade1': themeConfig.base_shade1_color,
      '--asc-color-base-shade2': themeConfig.base_shade2_color,
      '--asc-color-base-shade3': themeConfig.base_shade3_color,
      '--asc-color-base-shade4': themeConfig.base_shade4_color,
      '--asc-color-base-shade5': themeConfig.base_shade5_color,

      '--asc-color-background-default': themeConfig.background_color,
    };
  }, [config, computedTheme]);

  return generatedColors as React.CSSProperties;
}

/**
 * Apply the host's `fonts` config as CSS custom properties on the document root.
 *
 * Written to `:root` (not to the UIKit's own `.asc-uikit` wrapper) for two
 * reasons: it is where `~/v4/styles/global.css` declares
 * `--asc-text-global-font-family`, so this overrides the existing variable in
 * the scope it was defined in; and the UIKit's overlays (react-aria popovers,
 * modals, drawers) portal to `document.body`, outside the wrapper — a
 * wrapper-scoped variable would leave all of their text on the default font.
 *
 * Only the variables the config actually resolves are written, and they are
 * removed again on unmount, so a UIKit rendered without `fonts` leaves the
 * document exactly as it found it.
 */
export function useFontFamilyVariables(fonts?: AmityFontConfig) {
  const fontVariables = useMemo(
    () => resolveFontVariables(fonts),
    // Keyed on the config's VALUES rather than its object identity: hosts
    // normally pass an inline literal (`fonts={{ fontFamily: 'Roboto' }}`), which
    // is a fresh object on every render and would otherwise re-write every
    // variable each time the provider re-renders.
    [
      fonts?.fontFamily,
      fonts?.regular,
      fonts?.medium,
      fonts?.semiBold,
      fonts?.bold,
      fonts?.extraBold,
    ],
  );

  useEffect(() => {
    const root = document.documentElement;
    const names = Object.keys(fontVariables);

    // With no configured font this is an empty map, so both loops are no-ops and
    // the document root is never touched.
    names.forEach((name) => root.style.setProperty(name, fontVariables[name]));

    return () => {
      names.forEach((name) => root.style.removeProperty(name));
    };
  }, [fontVariables]);

  return fontVariables;
}

type Theme = 'light' | 'dark';

export const ThemeContext = createContext<{
  currentTheme: Theme;
  /** When set, overrides both preferred_theme and currentTheme for style generation. */
  forcedTheme?: Theme;
  toggleTheme: (theme: Theme) => void;
  setDefaultTheme: () => void;
}>({
  currentTheme: 'light',
  toggleTheme: () => {},
  setDefaultTheme: () => {},
});

export const ThemeProvider: React.FC<
  PropsWithChildren<{ config?: Config; fonts?: AmityFontConfig }>
> = ({ children, config, fonts }) => {
  useFontFamilyVariables(fonts);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const isDefaultTheme = config?.preferred_theme === 'default' || !config?.preferred_theme;

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(
    !isDefaultTheme
      ? (config.preferred_theme as 'dark' | 'light')
      : mediaQuery.matches
        ? 'dark'
        : 'light',
  );

  useEffect(() => {
    if (!isDefaultTheme) {
      setCurrentTheme(config.preferred_theme as 'dark' | 'light');
    } else {
      setCurrentTheme(mediaQuery.matches ? 'dark' : 'light');
    }
  }, [config?.preferred_theme]);

  useEffect(() => {
    const handleChange = (e: MediaQueryListEvent) => {
      if (!isDefaultTheme) return;
      setCurrentTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [config?.preferred_theme]);

  const setDefaultTheme = () => {
    if (!isDefaultTheme) {
      setCurrentTheme(config.preferred_theme as 'dark' | 'light');
    } else {
      setCurrentTheme(mediaQuery.matches ? 'dark' : 'light');
    }
  };

  const toggleTheme = (theme?: Theme) => {
    setCurrentTheme((prevTheme) => (theme ? theme : prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, toggleTheme, setDefaultTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const { currentTheme, forcedTheme, toggleTheme, setDefaultTheme } = useContext(ThemeContext);

  return { currentTheme, forcedTheme, toggleTheme, setDefaultTheme };
};
