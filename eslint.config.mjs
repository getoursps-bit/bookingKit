import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Physical left/right utilities break the right-to-left layout. Use the
// logical ones instead: ms-/me-, ps-/pe-, start-/end-, text-start/text-end.
const physicalClass = /(^|\s|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|text-left|text-right)(-|\s|$)/;
const physicalMessage =
  "Physical left/right classes break right-to-left layout; use logical ones (ms-, me-, ps-, pe-, start-, end-, text-start, text-end).";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "worker/dist/**", "coverage/**", "playwright-report/**", "next-env.d.ts"]),
  {
    rules: {
      // The full recommended accessibility set; Next only enables a few by default.
      ...jsxA11y.flatConfigs.recommended.rules,
      "no-restricted-syntax": [
        "error",
        { selector: `JSXAttribute[name.name='className'] Literal[value=${physicalClass}]`, message: physicalMessage },
        { selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${physicalClass}]`, message: physicalMessage },
      ],
    },
  },
]);
