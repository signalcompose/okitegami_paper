# Task C: Reference Solution

## 1. Define PaymentGateway interface

In `src/services/payment-service.ts` (or a separate types file):

```typescript
import { Payment, PaymentResult } from "../models/payment.js";

export interface PaymentGateway {
  charge(payment: Payment): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}
```

## 2. Define EmailClient interface

In `src/services/email-service.ts` (or a separate types file):

```typescript
export interface EmailClient {
  sendEmail(to: string, subject: string, body: string): Promise<boolean>;
}
```

## 3. Refactor PaymentService with constructor injection

```typescript
import { Payment, PaymentResult } from "../models/payment.js";
import { StripeGateway } from "./stripe-gateway.js";

export interface PaymentGateway {
  charge(payment: Payment): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}

export class PaymentService {
  private gateway: PaymentGateway;

  constructor(gateway: PaymentGateway = new StripeGateway()) {
    this.gateway = gateway;
  }

  async processPayment(payment: Payment): Promise<PaymentResult> {
    return this.gateway.charge(payment);
  }

  async refundPayment(transactionId: string): Promise<PaymentResult> {
    return this.gateway.refund(transactionId);
  }
}
```

## 4. Refactor EmailService with constructor injection

```typescript
import { SmtpClient } from "./smtp-client.js";

export interface EmailClient {
  sendEmail(to: string, subject: string, body: string): Promise<boolean>;
}

export class EmailService {
  private client: EmailClient;

  constructor(client: EmailClient = new SmtpClient()) {
    this.client = client;
  }

  async sendReceipt(to: string, orderId: string, amount: number): Promise<boolean> {
    return this.client.sendEmail(
      to,
      `Receipt for Order ${orderId}`,
      `Thank you! Amount: $${amount.toFixed(2)}`,
    );
  }

  async sendRefundNotification(to: string, orderId: string): Promise<boolean> {
    return this.client.sendEmail(
      to,
      `Refund for Order ${orderId}`,
      "Your refund has been processed.",
    );
  }
}
```

## 5. Refactor OrderService with constructor injection

```typescript
import { Order } from "../models/order.js";
import { Payment } from "../models/payment.js";
import { PaymentService } from "./payment-service.js";
import { EmailService } from "./email-service.js";

export class OrderService {
  private paymentService: PaymentService;
  private emailService: EmailService;

  constructor(
    paymentService: PaymentService = new PaymentService(),
    emailService: EmailService = new EmailService(),
  ) {
    this.paymentService = paymentService;
    this.emailService = emailService;
  }

  async checkout(order: Order, customerEmail: string): Promise<boolean> {
    const payment: Payment = {
      id: `pay_${order.id}`,
      amount: order.total,
      currency: "USD",
      status: "pending",
      customerId: order.customerId,
      createdAt: new Date().toISOString(),
    };

    const result = await this.paymentService.processPayment(payment);
    if (!result.success) {
      return false;
    }

    await this.emailService.sendReceipt(customerEmail, order.id, order.total);
    return true;
  }

  async cancelOrder(
    order: Order,
    customerEmail: string,
    transactionId: string,
  ): Promise<boolean> {
    const result = await this.paymentService.refundPayment(transactionId);
    if (!result.success) {
      return false;
    }

    await this.emailService.sendRefundNotification(customerEmail, order.id);
    return true;
  }
}
```

## Key Design Decisions

1. **Default parameters**: Using `= new StripeGateway()` as default allows backward compatibility — `new PaymentService()` still works without arguments.
2. **Interface co-location**: Interfaces are defined in the same file as the service that depends on them, following the Dependency Inversion Principle (the consumer owns the abstraction).
3. **No factory pattern**: For this scale, constructor injection with defaults is sufficient. A DI container or factory would be over-engineering.

## Verification

After refactoring:
- `npm run test` — all functional and DI compliance tests pass
- `npm run lint` — no DI violation errors (constructors use parameters, not direct instantiation)
