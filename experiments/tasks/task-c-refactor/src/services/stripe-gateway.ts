import { Payment, PaymentResult } from "../models/payment.js";

export class StripeGateway {
  async charge(payment: Payment): Promise<PaymentResult> {
    // Simulated Stripe API call
    if (payment.amount <= 0) {
      return { success: false, error: "Invalid amount" };
    }
    return {
      success: true,
      transactionId: `stripe_${Date.now()}_${payment.id}`,
    };
  }

  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true, transactionId };
  }
}
