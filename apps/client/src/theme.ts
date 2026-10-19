import {
  Badge,
  createTheme,
  CSSVariablesResolver,
  MantineColorsTuple,
  Tabs,
  Tooltip,
  v8CssVariablesResolver,
} from "@mantine/core";

const blue: MantineColorsTuple = [
  "#e7f3ff",
  "#d0e4ff",
  "#a1c6fa",
  "#6ea6f6",
  "#458bf2",
  "#2b7af1",
  "#0b60d8",
  "#1b72f2",
  "#0056c1",
  "#004aac",
];

const red: MantineColorsTuple = [
  "#ffebeb",
  "#fad7d7",
  "#eeadad",
  "#e3807f",
  "#da5a59",
  "#d54241",
  "#d43535",
  "#bc2727",
  "#a82022",
  "#93151b",
];

// Dark scheme follows the Dracula theme for VS Code (https://draculatheme.com).
// Greys map onto Mantine's dark scale: 7 = editor background, 8 = sidebar,
// 9 = deepest panels, 4 = borders/selection, 0 = foreground.
const draculaDark = [
  "#f8f8f2",
  "#e2e3dc",
  "#9ea8c7",
  "#6272a4",
  "#44475a",
  "#3c3f52",
  "#343746",
  "#282a36",
  "#21222c",
  "#191a21",
];

// [base accent, darker shade used behind white text (>= 4.5:1)]
const draculaAccents: Record<string, [string, string]> = {
  blue: ["#bd93f9", "#7653c9"],
  violet: ["#bd93f9", "#7653c9"],
  grape: ["#bd93f9", "#7653c9"],
  indigo: ["#bd93f9", "#7653c9"],
  pink: ["#ff79c6", "#b8337f"],
  cyan: ["#8be9fd", "#1d7f96"],
  teal: ["#8be9fd", "#1d7f96"],
  green: ["#50fa7b", "#1c7a36"],
  lime: ["#50fa7b", "#1c7a36"],
  orange: ["#ffb86c", "#b25e10"],
  red: ["#ff5555", "#c62f2f"],
  yellow: ["#f1fa8c", "#6e6e0e"],
};

function hexToRgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function draculaDarkVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  draculaDark.forEach((value, index) => {
    vars[`--mantine-color-dark-${index}`] = value;
  });

  for (const [color, [base, filled]] of Object.entries(draculaAccents)) {
    // shades 3-6 are what dark-mode text, icons and custom CSS reach for
    for (const shade of [3, 4, 5, 6]) {
      vars[`--mantine-color-${color}-${shade}`] = base;
    }
    vars[`--mantine-color-${color}-7`] = filled;
    vars[`--mantine-color-${color}-8`] = filled;
    vars[`--mantine-color-${color}-9`] = filled;
    vars[`--mantine-color-${color}-text`] = base;
    vars[`--mantine-color-${color}-filled`] = filled;
    vars[`--mantine-color-${color}-filled-hover`] = filled;
    vars[`--mantine-color-${color}-light`] = hexToRgba(base, 0.15);
    vars[`--mantine-color-${color}-light-hover`] = hexToRgba(base, 0.22);
    vars[`--mantine-color-${color}-light-color`] = base;
    vars[`--mantine-color-${color}-outline`] = base;
    vars[`--mantine-color-${color}-outline-hover`] = hexToRgba(base, 0.1);
  }

  return vars;
}

export const theme = createTheme({
  colors: {
    blue,
    red,
  },
  defaultRadius: 'sm',
  components: {
    Tooltip: Tooltip.extend({
      defaultProps: {
        events: { hover: true, focus: true, touch: false },
      },
    }),
    // Size badges to their content; fit-content collapses inside table cells.
    Badge: Badge.extend({
      styles: (_theme, props) => ({
        root:
          props.fullWidth || props.circle
            ? {}
            : { width: "max-content", maxWidth: "100%" },
      }),
    }),
    Tabs: Tabs.extend({
      vars: (theme, props) => ({
        root: {
          ...(props.color === "dark" && {
            "--tabs-color": "var(--mantine-color-dark-default)",
          }),
        },
      }),
    }),
  },
  /***
  components: {
    ActionIcon: ActionIcon.extend({
      vars: (_theme, props) => {
        return {
          root: {
            ...(props.variant === "subtle" &&
              props.color === "dark" && {
                "--ai-color": "var(--mantine-color-default-color)",
                "--ai-hover": "var(--mantine-color-default-hover)",
              }),
          },
        };
      },
    }),
  },
  ***/
});

export const mantineCssResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    ...v8CssVariablesResolver(theme).variables,
    "--input-error-size": theme.fontSizes.sm,
  },
  light: {
    ...v8CssVariablesResolver(theme).light,
    "--mantine-color-dimmed": "#4b5563",
    "--mantine-color-dark-light-color": "#4e5359",
    "--mantine-color-dark-light-hover": "var(--mantine-color-gray-light-hover)",
    // Override the semantic error color so input error text / borders /
    // required asterisks meet WCAG AA 4.5:1 contrast on the filled-input
    // background (#f1f3f5). red.6 (#d43535) lands at 4.36:1; red.7 (#bc2727)
    // gives ~5.7:1. Does not affect other red usages.
    "--mantine-color-error": "var(--mantine-color-red-7)",
    // Bump subtle-gray icon/text color from gray.6 (#868e96, 2.99:1 on filled
    // input — fails WCAG AA 3:1 for non-text) to gray.7 (#495057, 7.35:1).
    // Affects ActionIcon variant="subtle" color="gray" (password visibility
    // toggle, row action menus, etc.).
    "--mantine-color-gray-light-color": "var(--mantine-color-gray-7)",
    // Bump input placeholder color from gray.5 (#adb5bd, 1.87:1 on filled
    // input — fails WCAG AA 4.5:1) to #686868 (5.01:1 on filled, 5.57:1 on
    // white). Halfway between Mantine's gray.6 and gray.7 so the placeholder
    // stays visually distinct from real text while clearing the bar with a
    // safe margin. Affects placeholders across all Mantine inputs.
    "--mantine-color-placeholder": "#686868",
    // Bump variant="light" red text from red.6 (#d43535, 4.17:1 on the
    // 10% red-over-white blended pink background — fails WCAG AA 4.5:1)
    // to red.7 (#bc2727, 5.26:1). Affects every <Button color="red"
    // variant="light"> and matching Badge / Text usages (destructive
    // actions, red badges).
    "--mantine-color-red-light-color": "var(--mantine-color-red-7)",
    // Bump variant="light" green text. Green is inherently bright in
    // luminance, so even Mantine's green.9 (#2b8a3e, 3.78:1) fails 4.5:1
    // on the light-green bg. Use a custom dark green (#1b5e20, Material
    // green 900) outside the standard palette range. New contrast:
    // ~6.8:1. Affects every <Badge color="green" variant="light"> and
    // matching Button / Text usages.
    "--mantine-color-green-light-color": "#1B5E20",
    "--mantine-color-orange-light-color": "#a63508",
  },
  dark: {
    ...v8CssVariablesResolver(theme).dark,
    ...draculaDarkVariables(),
    "--mantine-color-dark-light-color": "var(--mantine-color-dark-1)",
    "--mantine-color-dark-light-hover": "var(--mantine-color-default-hover)",
    "--mantine-color-text": "var(--mantine-color-dark-0)",
    "--mantine-color-body": "var(--mantine-color-dark-7)",
    "--mantine-color-dimmed": "var(--mantine-color-dark-2)",
    // dimmed grey-blue: 6:1 on the editor background, distinct from text
    "--mantine-color-placeholder": "var(--mantine-color-dark-2)",
    // Dracula uses cyan for links
    "--mantine-color-anchor": "#8be9fd",
    "--mantine-color-default": "var(--mantine-color-dark-6)",
    "--mantine-color-default-hover": "var(--mantine-color-dark-5)",
    "--mantine-color-default-color": "var(--mantine-color-dark-0)",
    "--mantine-color-default-border": "var(--mantine-color-dark-4)",
    "--mantine-color-error": "#ff5555",
    "--mantine-primary-color-filled": "var(--mantine-color-blue-filled)",
    "--mantine-primary-color-filled-hover": "#6847b8",
    "--mantine-primary-color-light": "var(--mantine-color-blue-light)",
    "--mantine-primary-color-light-hover": "var(--mantine-color-blue-light-hover)",
    "--mantine-primary-color-light-color": "var(--mantine-color-blue-light-color)",
  },
});
