import { env } from "@/libs/env";

type OrderItem = { title: string; price: string; quantity: number };

export const buildOrderConfirmationEmail = (order: {
  orderId: string;
  total: string;
  items: OrderItem[];
}) => {
  const lines = order.items.map(
    (i) => `- ${i.title} x${i.quantity} @ $${i.price}`,
  );
  const rows = order.items
    .map(
      (i) =>
        `<tr><td>${i.title}</td><td>${i.quantity}</td><td>$${i.price}</td></tr>`,
    )
    .join("");

  return {
    subject: `Order confirmation #${order.orderId}`,
    text: `Thanks for your order!\n\nOrder #${order.orderId}\n\n${lines.join("\n")}\n\nTotal: $${order.total}`,
    html: `<h2>Thanks for your order!</h2>
<p>Order <strong>#${order.orderId}</strong></p>
<table><tr><th>Item</th><th>Qty</th><th>Price</th></tr>${rows}</table>
<p><strong>Total: $${order.total}</strong></p>`,
  };
};

export const buildOrderStatusEmail = (order: {
  orderId: string;
  status: string;
}) => ({
  subject: `Order #${order.orderId} is now ${order.status}`,
  text: `Your order #${order.orderId} status has been updated to: ${order.status}.`,
  html: `<p>Your order <strong>#${order.orderId}</strong> status has been updated to <strong>${order.status}</strong>.</p>`,
});

export const buildPasswordResetEmail = (resetUrl: string) => ({
  subject: "Reset your password",
  text: `Reset your password using this link: ${resetUrl}\n\nThis link expires in ${env.RESET_TOKEN_TTL_MINUTES} minutes. If you didn't request this, ignore this email.`,
  html: `<p>Reset your password using the link below:</p>
<p><a href="${resetUrl}">Reset password</a></p>
<p>This link expires in ${env.RESET_TOKEN_TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>`,
});
