export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  customerId: string;
  createdAt: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}
