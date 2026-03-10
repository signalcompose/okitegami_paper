import { Order } from "../models/order.js";
import { Payment } from "../models/payment.js";
import { PaymentService } from "./payment-service.js";
import { EmailService } from "./email-service.js";

export class OrderService {
  private paymentService = new PaymentService(); // DI VIOLATION
  private emailService = new EmailService(); // DI VIOLATION

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

  async cancelOrder(order: Order, customerEmail: string, transactionId: string): Promise<boolean> {
    const result = await this.paymentService.refundPayment(transactionId);
    if (!result.success) {
      return false;
    }

    await this.emailService.sendRefundNotification(customerEmail, order.id);
    return true;
  }
}
