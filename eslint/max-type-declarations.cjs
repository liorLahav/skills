"use strict";

const MAX_TYPE_DECLARATIONS = 2;

const TYPE_DECLARATION = new Set(["TSTypeAliasDeclaration", "TSInterfaceDeclaration"]);

const typeDeclaration = (statement) => {
  if (TYPE_DECLARATION.has(statement.type)) return statement;
  if (
    statement.type === "ExportNamedDeclaration" &&
    statement.declaration !== null &&
    statement.declaration !== undefined &&
    TYPE_DECLARATION.has(statement.declaration.type)
  ) {
    return statement.declaration;
  }
  return null;
};

const isExempt = (filename) => {
  const normalized = filename.replaceAll("\\", "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (base === "types.ts" || base.endsWith(".types.ts") || base.endsWith(".d.ts")) return true;
  if (base.endsWith(".test.ts")) return true;
  return normalized.split("/").includes("tests");
};

/** @type {import("eslint").Rule.RuleModule} */
const maxTypeDeclarations = {
  meta: {
    type: "problem",
    docs: {
      description: "A source file may declare at most two top-level type aliases or interfaces.",
    },
    schema: [],
    messages: {
      tooMany:
        "This file declares {{count}} top-level type aliases or interfaces (maximum {{max}}). Move them to types.ts or a *.types.ts file.",
    },
  },
  create: (context) => {
    if (isExempt(context.filename)) return {};
    return {
      Program: (node) => {
        const declarations = [];
        for (const statement of node.body) {
          const declaration = typeDeclaration(statement);
          if (declaration) declarations.push(declaration);
        }
        if (declarations.length <= MAX_TYPE_DECLARATIONS) return;
        const excess = declarations[MAX_TYPE_DECLARATIONS];
        if (!excess) return;
        context.report({
          node: excess,
          messageId: "tooMany",
          data: {
            count: String(declarations.length),
            max: String(MAX_TYPE_DECLARATIONS),
          },
        });
      },
    };
  },
};

module.exports = { maxTypeDeclarations };
