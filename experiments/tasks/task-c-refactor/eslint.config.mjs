import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Custom rule plugin to detect DI violations
const noDirectInstantiationPlugin = {
  meta: {
    name: "no-direct-instantiation-plugin",
    version: "1.0.0",
  },
  rules: {
    "no-direct-instantiation": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow direct instantiation of concrete classes inside service classes",
        },
        messages: {
          diViolation:
            "DI violation: Service class should not directly instantiate {{className}}. Use constructor injection instead.",
        },
        schema: [],
      },
      create(context) {
        const concreteClasses = new Set([
          "StripeGateway",
          "SmtpClient",
          "PaymentService",
          "EmailService",
        ]);

        const filename = context.filename || context.getFilename();
        const isServiceFile =
          filename.includes("/services/") || filename.includes("\\services\\");

        if (!isServiceFile) {
          return {};
        }

        let insideClassBody = false;

        return {
          ClassBody() {
            insideClassBody = true;
          },
          "ClassBody:exit"() {
            insideClassBody = false;
          },
          NewExpression(node) {
            if (!insideClassBody) {
              return;
            }

            const callee = node.callee;
            const className =
              callee.type === "Identifier" ? callee.name : null;

            if (className && concreteClasses.has(className)) {
              context.report({
                node,
                messageId: "diViolation",
                data: { className },
              });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "di-rules": noDirectInstantiationPlugin,
    },
    rules: {
      "di-rules/no-direct-instantiation": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "*.config.*"],
  },
);
