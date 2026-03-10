export class SmtpClient {
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    // Simulated SMTP send
    console.log(`Sending email to ${to}: ${subject}`);
    return true;
  }
}
