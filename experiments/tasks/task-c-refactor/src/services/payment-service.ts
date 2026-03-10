import { Payment, PaymentResult } from "../models/payment.js";
import { StripeGateway } from "./stripe-gateway.js";

export class PaymentService {
  private gateway = new StripeGateway(); // DI VIOLATION

  async processPayment(payment: Payment): Promise<PaymentResult> {
    return this.gateway.charge(payment);
  }

  async refundPayment(transactionId: string): Promise<PaymentResult> {
    return this.gateway.refund(transactionId);
  }
}
