import { describe, it, expect, vi } from "vitest";
import { PaymentService } from "../src/services/payment-service.js";
import { EmailService } from "../src/services/email-service.js";
import { OrderService } from "../src/services/order-service.js";
import { Payment, PaymentResult } from "../src/models/payment.js";
import { Order } from "../src/models/order.js";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay_001",
    amount: 99.99,
    currency: "USD",
    status: "pending",
    customerId: "cust_001",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_001",
    customerId: "cust_001",
    items: [{ productId: "prod_001", quantity: 1, price: 49.99 }],
    total: 49.99,
    status: "created",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DI Compliance: PaymentService", () => {
  it("constructor accepts a PaymentGateway interface", () => {
    const mockGateway = {
      charge: vi.fn().mockResolvedValue({ success: true, transactionId: "mock_txn" }),
      refund: vi.fn().mockResolvedValue({ success: true, transactionId: "mock_txn" }),
    };

    // This will fail if PaymentService doesn't accept constructor injection
    const service = new PaymentService(mockGateway);
    expect(service).toBeInstanceOf(PaymentService);
  });

  it("works with a mock gateway", async () => {
    const mockResult: PaymentResult = {
      success: true,
      transactionId: "mock_txn_123",
    };
    const mockGateway = {
      charge: vi.fn().mockResolvedValue(mockResult),
      refund: vi.fn().mockResolvedValue(mockResult),
    };

    const service = new PaymentService(mockGateway);
    const payment = makePayment();
    const result = await service.processPayment(payment);

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("mock_txn_123");
    expect(mockGateway.charge).toHaveBeenCalledWith(payment);
  });
});

describe("DI Compliance: EmailService", () => {
  it("constructor accepts an EmailClient interface", () => {
    const mockClient = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    // This will fail if EmailService doesn't accept constructor injection
    const service = new EmailService(mockClient);
    expect(service).toBeInstanceOf(EmailService);
  });

  it("works with a mock email client", async () => {
    const mockClient = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    const service = new EmailService(mockClient);
    const result = await service.sendReceipt("test@example.com", "ord_001", 49.99);

    expect(result).toBe(true);
    expect(mockClient.sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "Receipt for Order ord_001",
      "Thank you! Amount: $49.99"
    );
  });
});

describe("DI Compliance: OrderService", () => {
  it("constructor accepts PaymentService and EmailService", () => {
    const mockGateway = {
      charge: vi.fn().mockResolvedValue({ success: true, transactionId: "txn" }),
      refund: vi.fn().mockResolvedValue({ success: true, transactionId: "txn" }),
    };
    const mockClient = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    const paymentService = new PaymentService(mockGateway);
    const emailService = new EmailService(mockClient);

    // This will fail if OrderService doesn't accept constructor injection
    const service = new OrderService(paymentService, emailService);
    expect(service).toBeInstanceOf(OrderService);
  });

  it("works with mock dependencies end-to-end", async () => {
    const mockGateway = {
      charge: vi.fn().mockResolvedValue({ success: true, transactionId: "mock_txn" }),
      refund: vi.fn().mockResolvedValue({ success: true, transactionId: "mock_txn" }),
    };
    const mockClient = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    const paymentService = new PaymentService(mockGateway);
    const emailService = new EmailService(mockClient);
    const orderService = new OrderService(paymentService, emailService);

    const order = makeOrder();
    const result = await orderService.checkout(order, "test@example.com");

    expect(result).toBe(true);
    expect(mockGateway.charge).toHaveBeenCalled();
    expect(mockClient.sendEmail).toHaveBeenCalled();
  });
});
