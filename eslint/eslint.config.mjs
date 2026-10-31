import eslint from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { maxTypeDeclarations } from "./max-type-declarations.cjs";

const NO_CONDITION_TABLES = {
  selector:
    ":function ArrayExpression > ArrayExpression[elements.0.type=/^(BinaryExpression|LogicalExpression|UnaryExpression|CallExpression)$/][elements.1.type=/^(Literal|TemplateLiteral)$/]",
  message: "Do not move conditions into a [condition, label] list to pass complexity. Split by stage with plain ifs.",
};

export default tseslint.config(
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: {
      local: {
        rules: {
          "max-type-declarations": maxTypeDeclarations,
        },
      },
    },
    rules: {
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx"] }],
      "local/max-type-declarations": "error",
      curly: ["error", "all"],
      "prefer-destructuring": [
        "error",
        { VariableDeclarator: { object: true, array: false }, AssignmentExpression: { object: false, array: false } },
      ],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 15],
      "no-restricted-syntax": ["error", NO_CONDITION_TABLES],
    },
  },
  {
    files: ["src/**/*.ts"],
    plugins: { sonarjs },
    rules: {
      eqeqeq: "error",
      "no-else-return": "error",
      "no-param-reassign": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-implicit-coercion": "error",
      "no-nested-ternary": "error",
      "no-negated-condition": "error",
      "max-depth": ["error", 3],
      "id-length": ["error", { min: 2, exceptions: ["_", "i", "z"], properties: "never" }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"], leadingUnderscore: "allow" },
        { selector: "variable", modifiers: ["destructured"], format: null },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
        { selector: ["property", "method", "import"], format: null },
      ],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 5 }],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/prefer-single-boolean-return": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/no-nested-template-literals": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
    },
  },
);
