import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TASK_DIR = resolve(import.meta.dirname ?? ".", "../../experiments/tasks/task-c-refactor");

describe("Task C Validation", () => {
  describe("file structure", () => {
    it("has all required files", () => {
      const required = [
        "package.json",
        "tsconfig.json",
        "vitest.config.ts",
        "eslint.config.mjs",
        "TASK.md",
        "SOLUTION.md",
        "reset.sh",
        "src/models/payment.ts",
        "src/models/order.ts",
        "src/services/stripe-gateway.ts",
        "src/services/smtp-client.ts",
        "src/services/payment-service.ts",
        "src/services/email-service.ts",
        "src/services/order-service.ts",
        "src/index.ts",
        "tests/services.test.ts",
        "tests/di-compliance.test.ts",
      ];
      for (const file of required) {
        expect(existsSync(resolve(TASK_DIR, file)), `Missing: ${file}`).toBe(true);
      }
    });

    it("reset.sh contains git checkout command", () => {
      const content = readFileSync(resolve(TASK_DIR, "reset.sh"), "utf-8");
      expect(content).toContain("git checkout -- src/ tests/");
    });
  });

  describe("DI violations in initial state", () => {
    it("PaymentService directly instantiates StripeGateway", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/services/payment-service.ts"), "utf-8");
      // DI violation: direct instantiation inside class body
      expect(src).toContain("new StripeGateway()");
      // Uses field initializer, not constructor injection
      expect(src).toMatch(/private\s+gateway\s*=\s*new\s+StripeGateway\(\)/);
      // Should NOT have constructor injection
      expect(src).not.toMatch(/constructor\s*\(/);
    });

    it("EmailService directly instantiates SmtpClient", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/services/email-service.ts"), "utf-8");
      // DI violation: direct instantiation inside class body
      expect(src).toContain("new SmtpClient()");
      expect(src).toMatch(/private\s+client\s*=\s*new\s+SmtpClient\(\)/);
      // Should NOT have constructor injection
      expect(src).not.toMatch(/constructor\s*\(/);
    });

    it("OrderService directly instantiates PaymentService and EmailService", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/services/order-service.ts"), "utf-8");
      // DI violations: direct instantiation of both services
      expect(src).toContain("new PaymentService()");
      expect(src).toContain("new EmailService()");
      expect(src).toMatch(/private\s+paymentService\s*=\s*new\s+PaymentService\(\)/);
      expect(src).toMatch(/private\s+emailService\s*=\s*new\s+EmailService\(\)/);
      // Should NOT have constructor injection
      expect(src).not.toMatch(/constructor\s*\(/);
    });

    it("no service defines an interface for its dependency", () => {
      const paymentSrc = readFileSync(
        resolve(TASK_DIR, "src/services/payment-service.ts"),
        "utf-8"
      );
      const emailSrc = readFileSync(resolve(TASK_DIR, "src/services/email-service.ts"), "utf-8");
      // No PaymentGateway interface defined
      expect(paymentSrc).not.toContain("interface PaymentGateway");
      // No EmailClient interface defined
      expect(emailSrc).not.toContain("interface EmailClient");
    });
  });

  describe("ESLint configuration", () => {
    it("has custom no-direct-instantiation rule", () => {
      const config = readFileSync(resolve(TASK_DIR, "eslint.config.mjs"), "utf-8");
      expect(config).toContain("no-direct-instantiation");
      expect(config).toContain("di-rules");
    });

    it("rule targets concrete classes: StripeGateway, SmtpClient, PaymentService, EmailService", () => {
      const config = readFileSync(resolve(TASK_DIR, "eslint.config.mjs"), "utf-8");
      expect(config).toContain("StripeGateway");
      expect(config).toContain("SmtpClient");
      expect(config).toContain("PaymentService");
      expect(config).toContain("EmailService");
    });

    it("rule only applies to files in services/ directory", () => {
      const config = readFileSync(resolve(TASK_DIR, "eslint.config.mjs"), "utf-8");
      expect(config).toContain("/services/");
    });

    it("rule checks NewExpression inside ClassBody", () => {
      const config = readFileSync(resolve(TASK_DIR, "eslint.config.mjs"), "utf-8");
      expect(config).toContain("ClassBody");
      expect(config).toContain("NewExpression");
    });

    it("rule is set to error level", () => {
      const config = readFileSync(resolve(TASK_DIR, "eslint.config.mjs"), "utf-8");
      expect(config).toMatch(/["']di-rules\/no-direct-instantiation["']\s*:\s*["']error["']/);
    });
  });

  describe("solution validity", () => {
    it("SOLUTION.md contains DI-refactored code for all three services", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      // PaymentService with constructor injection
      expect(solution).toContain("interface PaymentGateway");
      expect(solution).toContain("constructor(gateway: PaymentGateway");
      // EmailService with constructor injection
      expect(solution).toContain("interface EmailClient");
      expect(solution).toContain("constructor(client: EmailClient");
      // OrderService with constructor injection
      expect(solution).toContain("constructor(\n    paymentService: PaymentService");
    });

    it("SOLUTION.md uses default parameters for backward compatibility", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      // Default parameters: `= new StripeGateway()` etc.
      expect(solution).toContain("= new StripeGateway()");
      expect(solution).toContain("= new SmtpClient()");
      expect(solution).toContain("= new PaymentService()");
      expect(solution).toContain("= new EmailService()");
    });
  });

  describe("test suite", () => {
    it("services.test.ts has 5 functional test cases", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/services.test.ts"), "utf-8");
      const testCount = (testSrc.match(/\bit\s*\(/g) || []).length;
      expect(testCount).toBe(5);
    });

    it("di-compliance.test.ts has 6 DI compliance test cases", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/di-compliance.test.ts"), "utf-8");
      const testCount = (testSrc.match(/\bit\s*\(/g) || []).length;
      expect(testCount).toBe(6);
    });

    it("di-compliance.test.ts validates constructor injection for all services", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/di-compliance.test.ts"), "utf-8");
      expect(testSrc).toContain("DI Compliance: PaymentService");
      expect(testSrc).toContain("DI Compliance: EmailService");
      expect(testSrc).toContain("DI Compliance: OrderService");
      // Tests create mock dependencies and pass them via constructor
      expect(testSrc).toContain("new PaymentService(mockGateway)");
      expect(testSrc).toContain("new EmailService(mockClient)");
      expect(testSrc).toContain("new OrderService(paymentService, emailService)");
    });
  });
});
