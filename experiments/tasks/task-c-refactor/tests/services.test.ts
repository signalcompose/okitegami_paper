import { describe, it, expect } from "vitest";
import { PaymentService } from "../src/services/payment-service.js";
import { EmailService } from "../src/services/email-service.js";
import { OrderService } from "../src/services/order-service.js";
import { Payment } from "../src/models/payment.js";
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

describe("PaymentService", () => {
  it("processes payment successfully", async () => {
    const service = new PaymentService();
    const payment = makePayment();
    const result = await service.processPayment(payment);

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
  });

  it("handles invalid amount", async () => {
    const service = new PaymentService();
    const payment = makePayment({ amount: -10 });
    const result = await service.processPayment(payment);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid amount");
  });
});

describe("EmailService", () => {
  it("sends receipt", async () => {
    const service = new EmailService();
    const result = await service.sendReceipt("test@example.com", "ord_001", 49.99);

    expect(result).toBe(true);
  });
});

describe("OrderService", () => {
  it("checkout success", async () => {
    const service = new OrderService();
    const order = makeOrder();
    const result = await service.checkout(order, "test@example.com");

    expect(result).toBe(true);
  });

  it("cancel success", async () => {
    const service = new OrderService();
    const order = makeOrder();
    const result = await service.cancelOrder(order, "test@example.com", "txn_001");

    expect(result).toBe(true);
  });
});
