export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}

export interface Order {
  orderId: string;
  items: CartItem[];
  total: number;
  placedAt: string;
}

// Cash-on-Delivery pilot: where the order goes. Collected at checkout and required before placing.
export interface DeliveryDetails {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}
