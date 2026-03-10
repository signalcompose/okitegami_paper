import { SmtpClient } from "./smtp-client.js";

export class EmailService {
  private client = new SmtpClient(); // DI VIOLATION

  async sendReceipt(to: string, orderId: string, amount: number): Promise<boolean> {
    return this.client.sendEmail(
      to,
      `Receipt for Order ${orderId}`,
      `Thank you! Amount: $${amount.toFixed(2)}`
    );
  }

  async sendRefundNotification(to: string, orderId: string): Promise<boolean> {
    return this.client.sendEmail(
      to,
      `Refund for Order ${orderId}`,
      "Your refund has been processed."
    );
  }
}
