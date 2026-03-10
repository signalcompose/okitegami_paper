export interface Order {
  id: string;
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  total: number;
  status: "created" | "paid" | "shipped" | "completed" | "cancelled";
  createdAt: string;
}
